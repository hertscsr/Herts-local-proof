import {
  companyCamLog,
  getErrorMessage,
} from "@/lib/companycam-logger";
export async function importCompanyCamProject(
  export async function removeDraftOnLabelRemoved
  export async function importCompanyCamProject(
  ccProjectId: string,
  requestId?: string
) {
  const supabase = createAdminClient();

  companyCamLog.info("project.fetch_started", {
    requestId,
    companyCamProjectId: ccProjectId,
  });

  /*
   * ---------------------------------------------------------
   * FETCH COMPANYCAM PROJECT
   * ---------------------------------------------------------
   */
  let ccProject: any;

  try {
    ccProject = await getCompanyCamProject(ccProjectId);
  } catch (error) {
    companyCamLog.error("project.fetch_failed", {
      requestId,
      companyCamProjectId: ccProjectId,
      error: getErrorMessage(error),
    });

    throw error;
  }

  /*
   * ---------------------------------------------------------
   * RESOLVE SERVICE TYPE
   * ---------------------------------------------------------
   */
  const labels: string[] = (ccProject.labels ?? []).map(
    (l: any) => l.display_value ?? l.value ?? l
  );

  const { serviceType, matched } = resolveServiceType(labels);

  companyCamLog.info("service.resolved", {
    requestId,
    companyCamProjectId: ccProjectId,
    labels,
    serviceType,
    matched,
  });

  const description = stripHtml(ccProject.description);

  const projectDescription = matched
    ? description
    : `[SERVICE TYPE NEEDS REVIEW — no matching CompanyCam label found]\n\n${description}`;

  /*
   * ---------------------------------------------------------
   * CHECK FOR EXISTING LOCAL PROJECT
   * ---------------------------------------------------------
   */
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("projects")
    .select("id, service_type, service_confirmed")
    .eq("companycam_project_id", ccProjectId)
    .maybeSingle();

  if (existingError) {
    companyCamLog.error("project.lookup_failed", {
      requestId,
      companyCamProjectId: ccProjectId,
      error: existingError.message,
    });

    throw new Error(existingError.message);
  }

  const fallbackName = ccProject.address?.street_address_1
    ? `Job at ${ccProject.address.street_address_1}`
    : "New Job — needs a name";

  /*
   * IMPORTANT:
   *
   * Do NOT put exact CompanyCam coordinates into latitude_public /
   * longitude_public.
   *
   * Public coordinates should only be generated later when publishing,
   * after your privacy/jitter logic runs.
   */
  const projectFields: Record<string, unknown> = {
    customer_name: ccProject.name?.trim() || fallbackName,
    street_address_private:
      ccProject.address?.street_address_1 ?? "",
    city: ccProject.address?.city ?? "",
    state: ccProject.address?.state ?? "",
    zip: ccProject.address?.postal_code ?? "",

    project_description: projectDescription,
    companycam_project_id: ccProjectId,
  };

  /*
   * Never downgrade a service type that was manually confirmed.
   */
  if (!existing?.service_confirmed || matched) {
    projectFields.service_type = matched
      ? serviceType
      : existing?.service_type ?? serviceType;

    projectFields.service_confirmed = matched
      ? true
      : existing?.service_confirmed ?? false;
  }

  /*
   * ---------------------------------------------------------
   * CREATE OR UPDATE PROJECT
   * ---------------------------------------------------------
   */
  let projectId: string;
  let projectCreated = false;

  if (existing) {
    projectId = existing.id;

    const { error: updateError } = await supabase
      .from("projects")
      .update(projectFields)
      .eq("id", projectId);

    if (updateError) {
      companyCamLog.error("project.update_failed", {
        requestId,
        companyCamProjectId: ccProjectId,
        projectId,
        error: updateError.message,
      });

      throw new Error(updateError.message);
    }

    companyCamLog.info("project.updated", {
      requestId,
      companyCamProjectId: ccProjectId,
      projectId,
      serviceType,
      serviceConfirmed: matched || existing.service_confirmed,
    });
  } else {
    const {
      data: created,
      error: createError,
    } = await supabase
      .from("projects")
      .insert({
        ...projectFields,
        slug: `draft-cc-${ccProjectId}`,
        publication_status: "draft",
        project_status: "completed",
      })
      .select()
      .single();

    if (createError) {
      companyCamLog.error("project.create_failed", {
        requestId,
        companyCamProjectId: ccProjectId,
        error: createError.message,
      });

      throw new Error(createError.message);
    }

    projectId = created.id;
    projectCreated = true;

    companyCamLog.info("project.created", {
      requestId,
      companyCamProjectId: ccProjectId,
      projectId,
      serviceType,
      serviceConfirmed: matched,
    });
  }

  /*
   * ---------------------------------------------------------
   * FIND ALREADY-IMPORTED PHOTOS
   * ---------------------------------------------------------
   */
  const {
    data: existingPhotos,
    error: existingPhotosError,
  } = await supabase
    .from("photos")
    .select("companycam_photo_id")
    .eq("project_id", projectId)
    .not("companycam_photo_id", "is", null);

  if (existingPhotosError) {
    companyCamLog.error("photos.lookup_failed", {
      requestId,
      companyCamProjectId: ccProjectId,
      projectId,
      error: existingPhotosError.message,
    });

    throw new Error(existingPhotosError.message);
  }

  const alreadyImported = new Set(
    (existingPhotos ?? [])
      .map((p) => p.companycam_photo_id)
      .filter(Boolean)
  );

  /*
   * ---------------------------------------------------------
   * FETCH COMPANYCAM PHOTOS
   * ---------------------------------------------------------
   */
  let ccPhotos: any[];

  try {
    ccPhotos = await listCompanyCamPhotos(ccProjectId);
  } catch (error) {
    companyCamLog.error("photos.fetch_failed", {
      requestId,
      companyCamProjectId: ccProjectId,
      projectId,
      error: getErrorMessage(error),
    });

    throw error;
  }

  companyCamLog.info("photos.sync_started", {
    requestId,
    companyCamProjectId: ccProjectId,
    projectId,
    photosFound: ccPhotos.length,
    alreadyInDatabase: alreadyImported.size,
  });

  /*
   * ---------------------------------------------------------
   * PHOTO COUNTERS
   * ---------------------------------------------------------
   */
  let importedCount = 0;
  let alreadyImportedCount = 0;
  let failedCount = 0;

  const failures: Array<{
    photoId: string;
    stage: string;
    error: string;
  }> = [];

  /*
   * ---------------------------------------------------------
   * IMPORT PHOTOS
   * ---------------------------------------------------------
   */
  for (const photo of ccPhotos) {
    const photoId = String(photo.id);

    /*
     * Already imported
     */
    if (alreadyImported.has(photo.id)) {
      alreadyImportedCount++;

      companyCamLog.info("photo.skipped_existing", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
      });

      continue;
    }

    /*
     * Missing CompanyCam URL
     */
    if (!photo.original_url) {
      failedCount++;

      failures.push({
        photoId,
        stage: "photo_url",
        error: "CompanyCam returned no original_url",
      });

      companyCamLog.warn("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "photo_url",
        error: "missing original_url",
      });

      continue;
    }

    /*
     * -------------------------------------------------------
     * DOWNLOAD PHOTO
     * -------------------------------------------------------
     */
    let imageRes: Response;

    try {
      imageRes = await fetch(photo.original_url);
    } catch (error) {
      failedCount++;

      const message = getErrorMessage(error);

      failures.push({
        photoId,
        stage: "photo_download",
        error: message,
      });

      companyCamLog.error("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "photo_download",
        error: message,
      });

      continue;
    }

    if (!imageRes.ok) {
      failedCount++;

      const message = `HTTP ${imageRes.status}`;

      failures.push({
        photoId,
        stage: "photo_download",
        error: message,
      });

      companyCamLog.error("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "photo_download",
        httpStatus: imageRes.status,
      });

      continue;
    }

    /*
     * -------------------------------------------------------
     * READ IMAGE
     * -------------------------------------------------------
     */
    let arrayBuffer: ArrayBuffer;

    try {
      arrayBuffer = await imageRes.arrayBuffer();
    } catch (error) {
      failedCount++;

      const message = getErrorMessage(error);

      failures.push({
        photoId,
        stage: "photo_read",
        error: message,
      });

      companyCamLog.error("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "photo_read",
        error: message,
      });

      continue;
    }

    const phase = guessPhase(photo.tags);
    const path = `${projectId}/${photoId}.jpg`;

    /*
     * -------------------------------------------------------
     * UPLOAD TO SUPABASE STORAGE
     * -------------------------------------------------------
     */
    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(path, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      failedCount++;

      failures.push({
        photoId,
        stage: "storage_upload",
        error: uploadError.message,
      });

      companyCamLog.error("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "storage_upload",
        bucket: "project-photos",
        storagePath: path,
        error: uploadError.message,
      });

      continue;
    }

    /*
     * -------------------------------------------------------
     * INSERT PHOTO DATABASE RECORD
     * -------------------------------------------------------
     */
    const { error: photoInsertError } = await supabase
      .from("photos")
      .insert({
        project_id: projectId,
        phase,
        storage_path: path,
        companycam_photo_id: photo.id,
        alt_text_auto: `${(
          serviceType ?? "project"
        ).replace(/_/g, " ")} project — ${phase} photo`,
      });

    if (photoInsertError) {
      failedCount++;

      failures.push({
        photoId,
        stage: "database_insert",
        error: photoInsertError.message,
      });

      companyCamLog.error("photo.failed", {
        requestId,
        projectId,
        companyCamProjectId: ccProjectId,
        photoId,
        stage: "database_insert",
        error: photoInsertError.message,
      });

      /*
       * Storage upload succeeded but DB insert failed.
       * Remove the uploaded file so we don't leave an orphan.
       */
      const { error: cleanupError } = await supabase.storage
        .from("project-photos")
        .remove([path]);

      if (cleanupError) {
        companyCamLog.warn("photo.cleanup_failed", {
          requestId,
          projectId,
          companyCamProjectId: ccProjectId,
          photoId,
          storagePath: path,
          error: cleanupError.message,
        });
      }

      continue;
    }

    importedCount++;

    companyCamLog.info("photo.imported", {
      requestId,
      projectId,
      companyCamProjectId: ccProjectId,
      photoId,
      phase,
    });
  }

  /*
   * ---------------------------------------------------------
   * DETERMINE RESULT
   * ---------------------------------------------------------
   */
  const status =
    failedCount === 0
      ? "success"
      : importedCount > 0 || alreadyImportedCount > 0
        ? "partial"
        : "failed";

  /*
   * One clean summary log.
   */
  companyCamLog.info("photos.sync_complete", {
    requestId,
    projectId,
    companyCamProjectId: ccProjectId,
    status,
    totalPhotos: ccPhotos.length,
    imported: importedCount,
    alreadyImported: alreadyImportedCount,
    failed: failedCount,
  });

  /*
   * Log a compact failure summary instead of dumping 49+ lines.
   */
  if (failedCount > 0) {
    companyCamLog.warn("photos.failures_summary", {
      requestId,
      projectId,
      companyCamProjectId: ccProjectId,
      failedCount,
      firstFailures: failures.slice(0, 10),
    });
  }

  return {
    projectId,
    companyCamProjectId: ccProjectId,
    projectCreated,

    status,

    serviceType,
    matched,

    totalPhotos: ccPhotos.length,
    importedCount,
    alreadyImportedCount,
    failedCount,

    failures: failures.slice(0, 10),
  };
}
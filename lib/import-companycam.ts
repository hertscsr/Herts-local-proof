import {
  companyCamLog,
  getErrorMessage,
} from "@/lib/companycam-logger";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  getCompanyCamProject,
  listCompanyCamPhotos,
  stripHtml,
  guessPhase,
  hasLocalProofTag,
  MAX_LOCALPROOF_PHOTOS,
} from "@/lib/companycam";

import { stripNeedsReviewMarker } from "@/lib/needs-review";

/**
 * Maps CompanyCam project labels to LocalProof service types.
 *
 * Keys are compared case-insensitively.
 */
const LABEL_TO_SERVICE_TYPE: Record<string, string> = {
  "roof replacement": "roof_replacement",
  repair: "roof_repair",
  "storm damage": "storm_damage",
  siding: "siding",
  gutters: "gutters",
  windows: "windows",

  // Deck-related labels
  decks: "deck_construction",
  decking: "deck_construction",
  deck: "deck_construction",
  "composite deck": "composite_deck",

  chimney: "chimney",

  // Closest current category until skylight gets its own service type.
  skylight: "roof_repair",
};

/**
 * Resolve a LocalProof service type from CompanyCam labels.
 *
 * Never guess when no matching label exists.
 */
export function resolveServiceType(
  labels: string[]
): {
  serviceType: string | null;
  matched: boolean;
} {
  for (const label of labels) {
    const key = String(label).toLowerCase().trim();

    if (LABEL_TO_SERVICE_TYPE[key]) {
      return {
        serviceType: LABEL_TO_SERVICE_TYPE[key],
        matched: true,
      };
    }
  }

  return {
    serviceType: null,
    matched: false,
  };
}

/**
 * Import one CompanyCam project and its photos into LocalProof.
 *
 * Safe to call repeatedly:
 * - Projects are matched by companycam_project_id.
 * - Photos are matched by companycam_photo_id.
 * - Existing photos are skipped.
 *
 * requestId is optional but recommended when called from the webhook so all
 * related logs can be tied together in Vercel.
 */
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
   * =========================================================
   * FETCH COMPANYCAM PROJECT
   * =========================================================
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
   * =========================================================
   * SERVICE TYPE
   * =========================================================
   */

  const labels: string[] = (ccProject.labels ?? []).map(
    (label: any) =>
      label?.display_value ??
      label?.value ??
      String(label)
  );

  const { serviceType, matched } =
    resolveServiceType(labels);

  companyCamLog.info("service.resolved", {
    requestId,
    companyCamProjectId: ccProjectId,
    labels,
    serviceType,
    matched,
  });

  const description = stripHtml(
    ccProject.description ?? ""
  );

  const projectDescription = matched
    ? description
    : `[SERVICE TYPE NEEDS REVIEW — no matching CompanyCam label found]\n\n${description}`;

  /*
   * =========================================================
   * FIND EXISTING LOCAL PROJECT
   * =========================================================
   */

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("projects")
    .select(
      "id, service_type, service_confirmed"
    )
    .eq(
      "companycam_project_id",
      ccProjectId
    )
    .maybeSingle();

  if (existingError) {
    companyCamLog.error(
      "project.lookup_failed",
      {
        requestId,
        companyCamProjectId:
          ccProjectId,
        error:
          existingError.message,
      }
    );

    throw new Error(
      existingError.message
    );
  }

  const fallbackName =
    ccProject.address?.street_address_1
      ? `Job at ${ccProject.address.street_address_1}`
      : "New Job — needs a name";

  /*
   * Do NOT store exact CompanyCam coordinates as public coordinates.
   *
   * 0 / 0 acts only as a draft placeholder for schemas where these columns
   * are required. Your publish route should replace them with the
   * privacy-safe/jittered coordinates before publication.
   */
  const projectFields: Record<
    string,
    unknown
  > = {
    customer_name:
      ccProject.name?.trim() ||
      fallbackName,

    street_address_private:
      ccProject.address
        ?.street_address_1 ?? "",

    city:
      ccProject.address?.city ?? "",

    state:
      ccProject.address?.state ?? "",

    zip:
      ccProject.address
        ?.postal_code ?? "",

    latitude_public: 0,
    longitude_public: 0,

    project_description:
      projectDescription,

    companycam_project_id:
      ccProjectId,
  };

  /*
   * Never downgrade a service type somebody already confirmed manually.
   *
   * If CompanyCam now contains a real matching service label, however,
   * that match can safely confirm the service.
   */
  if (
    !existing?.service_confirmed ||
    matched
  ) {
    projectFields.service_type =
      matched
        ? serviceType
        : existing?.service_type ??
          serviceType;

    projectFields.service_confirmed =
      matched
        ? true
        : existing
            ?.service_confirmed ??
          false;
  }

  /*
   * =========================================================
   * CREATE OR UPDATE PROJECT
   * =========================================================
   */

  let projectId: string;
  let projectCreated = false;

  if (existing) {
    projectId = existing.id;

    const {
      error: updateError,
    } = await supabase
      .from("projects")
      .update(projectFields)
      .eq("id", projectId);

    if (updateError) {
      companyCamLog.error(
        "project.update_failed",
        {
          requestId,
          companyCamProjectId:
            ccProjectId,
          projectId,
          error:
            updateError.message,
        }
      );

      throw new Error(
        updateError.message
      );
    }

    companyCamLog.info(
      "project.updated",
      {
        requestId,
        companyCamProjectId:
          ccProjectId,
        projectId,
        serviceType,
        serviceConfirmed:
          matched ||
          existing.service_confirmed,
      }
    );
  } else {
    const {
      data: created,
      error: createError,
    } = await supabase
      .from("projects")
      .insert({
        ...projectFields,

        slug: `draft-cc-${ccProjectId}`,

        publication_status:
          "draft",

        project_status:
          "completed",
      })
      .select()
      .single();

    if (createError) {
      companyCamLog.error(
        "project.create_failed",
        {
          requestId,
          companyCamProjectId:
            ccProjectId,
          error:
            createError.message,
        }
      );

      throw new Error(
        createError.message
      );
    }

    projectId = created.id;
    projectCreated = true;

    companyCamLog.info(
      "project.created",
      {
        requestId,
        companyCamProjectId:
          ccProjectId,
        projectId,
        serviceType,
        serviceConfirmed:
          matched,
      }
    );
  }

  /*
   * =========================================================
   * FIND EXISTING PHOTOS
   * =========================================================
   */

  const {
    data: existingPhotos,
    error: existingPhotosError,
  } = await supabase
    .from("photos")
    .select(
      "companycam_photo_id"
    )
    .eq(
      "project_id",
      projectId
    )
    .not(
      "companycam_photo_id",
      "is",
      null
    );

  if (existingPhotosError) {
    companyCamLog.error(
      "photos.lookup_failed",
      {
        requestId,
        companyCamProjectId:
          ccProjectId,
        projectId,
        error:
          existingPhotosError.message,
      }
    );

    throw new Error(
      existingPhotosError.message
    );
  }

  const alreadyImported =
    new Set<string>(
      (existingPhotos ?? [])
        .map(
          (photo) =>
            photo.companycam_photo_id
        )
        .filter(Boolean)
        .map(String)
    );

  /*
   * =========================================================
   * FETCH COMPANYCAM PHOTOS
   * =========================================================
   */

  let ccPhotos: any[];

  try {
    ccPhotos =
      await listCompanyCamPhotos(
        ccProjectId
      );
  } catch (error) {
    companyCamLog.error(
      "photos.fetch_failed",
      {
        requestId,
        companyCamProjectId:
          ccProjectId,
        projectId,
        error:
          getErrorMessage(error),
      }
    );

    throw error;
  }

  const totalCompanyCamPhotos =
    ccPhotos.length;

  const localProofTaggedPhotos =
    ccPhotos.filter(
      (photo) =>
        hasLocalProofTag(photo)
    );

  const localProofTaggedCount =
    localProofTaggedPhotos.length;

  /*
   * Only CompanyCam photos tagged LocalProof are eligible for
   * automatic LocalProof import. Hard-cap automatic selection at 5.
   *
   * Existing database photos are not deleted here. This keeps the
   * sync non-destructive for projects imported before tag gating.
   */
  ccPhotos =
    localProofTaggedPhotos.slice(
      0,
      MAX_LOCALPROOF_PHOTOS
    );

  companyCamLog.info(
    "photos.sync_started",
    {
      requestId,
      companyCamProjectId:
        ccProjectId,
      projectId,
      totalCompanyCamPhotos,
      localProofTagged:
        localProofTaggedCount,
      selectedForLocalProof:
        ccPhotos.length,
      maxLocalProofPhotos:
        MAX_LOCALPROOF_PHOTOS,
      skippedUntagged:
        totalCompanyCamPhotos -
        localProofTaggedCount,
      skippedOverLimit:
        Math.max(
          0,
          localProofTaggedCount -
            MAX_LOCALPROOF_PHOTOS
        ),
      alreadyInDatabase:
        alreadyImported.size,
    }
  );

  /*
   * =========================================================
   * COUNTERS
   * =========================================================
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
   * =========================================================
   * IMPORT PHOTOS
   * =========================================================
   */

  for (const photo of ccPhotos) {
    const photoId =
      String(photo.id);

    /*
     * Already imported
     */
    if (
      alreadyImported.has(photoId)
    ) {
      alreadyImportedCount++;

      companyCamLog.info(
        "photo.skipped_existing",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
        }
      );

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
        error:
          "CompanyCam returned no original_url",
      });

      companyCamLog.warn(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage: "photo_url",
          error:
            "missing original_url",
        }
      );

      continue;
    }

    /*
     * -------------------------------------------------------
     * DOWNLOAD PHOTO
     * -------------------------------------------------------
     */

    let imageRes: Response;

    try {
      imageRes = await fetch(
        photo.original_url
      );
    } catch (error) {
      failedCount++;

      const message =
        getErrorMessage(error);

      failures.push({
        photoId,
        stage:
          "photo_download",
        error: message,
      });

      companyCamLog.error(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage:
            "photo_download",
          error: message,
        }
      );

      continue;
    }

    if (!imageRes.ok) {
      failedCount++;

      const message =
        `HTTP ${imageRes.status}`;

      failures.push({
        photoId,
        stage:
          "photo_download",
        error: message,
      });

      companyCamLog.error(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage:
            "photo_download",
          httpStatus:
            imageRes.status,
        }
      );

      continue;
    }

    /*
     * -------------------------------------------------------
     * READ IMAGE DATA
     * -------------------------------------------------------
     */

    let arrayBuffer:
      ArrayBuffer;

    try {
      arrayBuffer =
        await imageRes.arrayBuffer();
    } catch (error) {
      failedCount++;

      const message =
        getErrorMessage(error);

      failures.push({
        photoId,
        stage:
          "photo_read",
        error: message,
      });

      companyCamLog.error(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage:
            "photo_read",
          error: message,
        }
      );

      continue;
    }

    const phase =
      guessPhase(photo.tags);

    const path =
      `${projectId}/${photoId}.jpg`;

    /*
     * -------------------------------------------------------
     * UPLOAD TO SUPABASE STORAGE
     * -------------------------------------------------------
     */

    const {
      error: uploadError,
    } = await supabase.storage
      .from("project-photos")
      .upload(
        path,
        arrayBuffer,
        {
          contentType:
            "image/jpeg",
          upsert: true,
        }
      );

    if (uploadError) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "storage_upload",
        error:
          uploadError.message,
      });

      companyCamLog.error(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage:
            "storage_upload",
          bucket:
            "project-photos",
          storagePath: path,
          error:
            uploadError.message,
        }
      );

      continue;
    }

    /*
     * -------------------------------------------------------
     * INSERT PHOTO DATABASE RECORD
     * -------------------------------------------------------
     */

    const {
      error: photoInsertError,
    } = await supabase
      .from("photos")
      .insert({
        project_id:
          projectId,

        phase,

        storage_path:
          path,

        companycam_photo_id:
          photoId,

        alt_text_auto:
          `${(
            serviceType ??
            "project"
          ).replace(
            /_/g,
            " "
          )} project — ${phase} photo`,
      });

    if (photoInsertError) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "database_insert",
        error:
          photoInsertError.message,
      });

      companyCamLog.error(
        "photo.failed",
        {
          requestId,
          projectId,
          companyCamProjectId:
            ccProjectId,
          photoId,
          stage:
            "database_insert",
          error:
            photoInsertError.message,
        }
      );

      /*
       * The file made it into Storage but the database row failed.
       *
       * Remove the file so we don't create orphaned Storage files.
       */
      const {
        error: cleanupError,
      } = await supabase.storage
        .from("project-photos")
        .remove([path]);

      if (cleanupError) {
        companyCamLog.warn(
          "photo.cleanup_failed",
          {
            requestId,
            projectId,
            companyCamProjectId:
              ccProjectId,
            photoId,
            storagePath:
              path,
            error:
              cleanupError.message,
          }
        );
      }

      continue;
    }

    importedCount++;

    companyCamLog.info(
      "photo.imported",
      {
        requestId,
        projectId,
        companyCamProjectId:
          ccProjectId,
        photoId,
        phase,
      }
    );
  }

  /*
   * =========================================================
   * IMPORT RESULT
   * =========================================================
   */

  const status =
    failedCount === 0
      ? "success"
      : importedCount > 0 ||
          alreadyImportedCount > 0
        ? "partial"
        : "failed";

  companyCamLog.info(
    "photos.sync_complete",
    {
      requestId,
      projectId,
      companyCamProjectId:
        ccProjectId,
      status,

      totalPhotos:
        totalCompanyCamPhotos,

      localProofTagged:
        localProofTaggedCount,

      selectedForLocalProof:
        ccPhotos.length,

      imported:
        importedCount,

      alreadyImported:
        alreadyImportedCount,

      failed:
        failedCount,
    }
  );

  /*
   * Keep the Vercel summary compact.
   *
   * Individual failures were already logged while processing the photos.
   */
  if (failedCount > 0) {
    companyCamLog.warn(
      "photos.failures_summary",
      {
        requestId,
        projectId,
        companyCamProjectId:
          ccProjectId,
        failedCount,
        firstFailures:
          failures.slice(0, 10),
      }
    );
  }

  return {
    projectId,
    companyCamProjectId:
      ccProjectId,

    projectCreated,

    status,

    serviceType,
    matched,

    totalPhotos:
      totalCompanyCamPhotos,

    localProofTaggedCount,

    selectedForLocalProof:
      ccPhotos.length,

    maxLocalProofPhotos:
      MAX_LOCALPROOF_PHOTOS,

    importedCount,
    alreadyImportedCount,
    failedCount,

    failures:
      failures.slice(0, 10),
  };
}

/**
 * Called when the Hertsworks label is removed from CompanyCam.
 *
 * Draft projects are removed.
 * Published projects are never automatically deleted.
 */
export async function removeDraftOnLabelRemoved(
  ccProjectId: string
) {

  const supabase =
    createAdminClient();

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select(
      "id, publication_status"
    )
    .eq(
      "companycam_project_id",
      ccProjectId
    )
    .maybeSingle();

  if (projectError) {
    companyCamLog.error(
      "draft_cleanup.lookup_failed",
      {
        companyCamProjectId:
          ccProjectId,
        error:
          projectError.message,
      }
    );

    throw new Error(
      projectError.message
    );
  }

  if (
    !project ||
    project.publication_status ===
      "published"
  ) {
    return {
      deleted: false,
    };
  }

  const {
    data: photos,
    error: photosError,
  } = await supabase
    .from("photos")
    .select("storage_path")
    .eq(
      "project_id",
      project.id
    );

  if (photosError) {
    throw new Error(
      photosError.message
    );
  }

  const paths =
    (photos ?? [])
      .map(
        (photo) =>
          photo.storage_path
      )
      .filter(Boolean);

  if (paths.length > 0) {
    const {
      error: storageError,
    } = await supabase.storage
      .from("project-photos")
      .remove(paths);

    if (storageError) {
      companyCamLog.warn(
        "draft_cleanup.storage_failed",
        {
          companyCamProjectId:
            ccProjectId,
          projectId:
            project.id,
          error:
            storageError.message,
        }
      );
    }
  }

  const {
    error: photoDeleteError,
  } = await supabase
    .from("photos")
    .delete()
    .eq(
      "project_id",
      project.id
    );

  if (photoDeleteError) {
    throw new Error(
      photoDeleteError.message
    );
  }

  const {
    error: projectDeleteError,
  } = await supabase
    .from("projects")
    .delete()
    .eq(
      "id",
      project.id
    );

  if (projectDeleteError) {
    throw new Error(
      projectDeleteError.message
    );
  }

  companyCamLog.info(
    "draft_cleanup.complete",
    {
      companyCamProjectId:
        ccProjectId,
      projectId:
        project.id,
      deletedPhotoFiles:
        paths.length,
    }
  );

  return {
    deleted: true,
    projectId:
      project.id,
  };
}

/**
 * Re-check the current CompanyCam labels for an existing LocalProof project.
 *
 * Useful when the Hertsworks label was applied before the actual service
 * label.
 */
export async function resyncServiceTypeFromCompanyCam(
  projectId: string,
  ccProject?: any
) {

  const supabase =
    createAdminClient();

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select(
      "companycam_project_id, project_description, service_type"
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(
      projectError.message
    );
  }

  if (
    !project?.companycam_project_id
  ) {
    return {
      updated: false,
      reason:
        "not linked to a CompanyCam project",
    };
  }

  const cc =
    ccProject ??
    (await getCompanyCamProject(
      project.companycam_project_id
    ));

  const labels: string[] =
    (cc.labels ?? []).map(
      (label: any) =>
        label?.display_value ??
        label?.value ??
        String(label)
    );

  const {
    serviceType,
    matched,
  } = resolveServiceType(labels);

  if (!matched) {
    return {
      updated: false,
      reason:
        "no matching CompanyCam label found yet",
    };
  }

  const {
    error: updateError,
  } = await supabase
    .from("projects")
    .update({
      service_type:
        serviceType,

      service_confirmed:
        true,

      project_description:
        stripNeedsReviewMarker(
          project.project_description
        ),
    })
    .eq("id", projectId);

  if (updateError) {
    throw new Error(
      updateError.message
    );
  }

  companyCamLog.info(
    "service.resynced",
    {
      projectId,
      companyCamProjectId:
        project.companycam_project_id,
      previousServiceType:
        project.service_type,
      serviceType,
    }
  );

  return {
    updated: true,
    serviceType,
    changed:
      serviceType !==
      project.service_type,
  };
}

/**
 * Manual CompanyCam photo import.
 *
 * Staff can:
 * - select specific CompanyCam photos
 * - add them to an existing LocalProof project
 * - or create/reuse a draft
 */
export async function manualImportCompanyCamPhotos(
  opts: {
    ccProjectId: string;
    photoIds: string[];
    targetProjectId?:
      | string
      | null;
  }
) {
  const uniquePhotoIds = Array.from(
    new Set(opts.photoIds.map(String))
  );

  if (uniquePhotoIds.length === 0) {
    throw new Error("At least one photo is required.");
  }

  if (uniquePhotoIds.length > MAX_LOCALPROOF_PHOTOS) {
    throw new Error(
      `LocalProof allows a maximum of ${MAX_LOCALPROOF_PHOTOS} photos per manual import.`
    );
  }

  opts.photoIds = uniquePhotoIds;

  const supabase =
    createAdminClient();

  const ccProject =
    await getCompanyCamProject(
      opts.ccProjectId
    );

  let projectId: string;

  /*
   * =========================================================
   * RESOLVE TARGET PROJECT
   * =========================================================
   */

  if (opts.targetProjectId) {
    projectId =
      opts.targetProjectId;

    const {
      data: target,
      error: targetError,
    } = await supabase
      .from("projects")
      .select(
        "companycam_project_id"
      )
      .eq("id", projectId)
      .maybeSingle();

    if (targetError) {
      throw new Error(
        targetError.message
      );
    }

    if (
      target &&
      !target.companycam_project_id
    ) {
      const {
        error: linkError,
      } = await supabase
        .from("projects")
        .update({
          companycam_project_id:
            opts.ccProjectId,
        })
        .eq("id", projectId);

      if (linkError) {
        throw new Error(
          linkError.message
        );
      }
    }

    await resyncServiceTypeFromCompanyCam(
      projectId,
      ccProject
    );
  } else {
    const {
      data: existingProject,
      error: existingProjectError,
    } = await supabase
      .from("projects")
      .select("id")
      .eq(
        "companycam_project_id",
        opts.ccProjectId
      )
      .maybeSingle();

    if (existingProjectError) {
      throw new Error(
        existingProjectError.message
      );
    }

    if (existingProject) {
      projectId =
        existingProject.id;
    } else {
      const labels: string[] =
        (
          ccProject.labels ?? []
        ).map(
          (label: any) =>
            label?.display_value ??
            label?.value ??
            String(label)
        );

      const {
        serviceType,
        matched,
      } =
        resolveServiceType(
          labels
        );

      const description =
        stripHtml(
          ccProject.description ??
            ""
        );

      const projectDescription =
        matched
          ? description
          : `[SERVICE TYPE NEEDS REVIEW — no matching CompanyCam label found]\n\n${description}`;

      const fallbackName =
        ccProject.address
          ?.street_address_1
          ? `Job at ${ccProject.address.street_address_1}`
          : "New Job — needs a name";

      const {
        data: created,
        error: createError,
      } = await supabase
        .from("projects")
        .insert({
          customer_name:
            ccProject.name?.trim() ||
            fallbackName,

          street_address_private:
            ccProject.address
              ?.street_address_1 ??
            "",

          city:
            ccProject.address
              ?.city ?? "",

          state:
            ccProject.address
              ?.state ?? "",

          zip:
            ccProject.address
              ?.postal_code ?? "",

          /*
           * Privacy-safe placeholders until publication.
           */
          latitude_public: 0,
          longitude_public: 0,

          service_type:
            serviceType,

          service_confirmed:
            matched,

          project_description:
            projectDescription,

          companycam_project_id:
            opts.ccProjectId,

          slug:
            `draft-cc-${opts.ccProjectId}`,

          publication_status:
            "draft",

          project_status:
            "completed",
        })
        .select()
        .single();

      if (createError) {
        throw new Error(
          createError.message
        );
      }

      projectId = created.id;
    }
  }

  /*
   * =========================================================
   * EXISTING PHOTOS
   * =========================================================
   */

  const {
    data: existingPhotos,
    error: existingPhotosError,
  } = await supabase
    .from("photos")
    .select(
      "companycam_photo_id"
    )
    .eq(
      "project_id",
      projectId
    )
    .not(
      "companycam_photo_id",
      "is",
      null
    );

  if (existingPhotosError) {
    throw new Error(
      existingPhotosError.message
    );
  }

  const alreadyImported =
    new Set<string>(
      (existingPhotos ?? [])
        .map(
          (photo) =>
            photo.companycam_photo_id
        )
        .filter(Boolean)
        .map(String)
    );

  const allPhotos =
    await listCompanyCamPhotos(
      opts.ccProjectId
    );

  const wanted =
    new Set(
      opts.photoIds.map(String)
    );

  let importedCount = 0;
  let alreadyImportedCount = 0;
  let failedCount = 0;

  const failures: Array<{
    photoId: string;
    stage: string;
    error: string;
  }> = [];

  /*
   * =========================================================
   * IMPORT SELECTED PHOTOS
   * =========================================================
   */

  for (const photo of allPhotos) {
    const photoId =
      String(photo.id);

    if (!wanted.has(photoId)) {
      continue;
    }

    if (
      alreadyImported.has(photoId)
    ) {
      alreadyImportedCount++;
      continue;
    }

    if (!photo.original_url) {
      failedCount++;

      failures.push({
        photoId,
        stage: "photo_url",
        error:
          "CompanyCam returned no original_url",
      });

      continue;
    }

    let imageRes: Response;

    try {
      imageRes = await fetch(
        photo.original_url
      );
    } catch (error) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "photo_download",
        error:
          getErrorMessage(error),
      });

      continue;
    }

    if (!imageRes.ok) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "photo_download",
        error:
          `HTTP ${imageRes.status}`,
      });

      continue;
    }

    let arrayBuffer:
      ArrayBuffer;

    try {
      arrayBuffer =
        await imageRes.arrayBuffer();
    } catch (error) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "photo_read",
        error:
          getErrorMessage(error),
      });

      continue;
    }

    const phase =
      guessPhase(photo.tags);

    const path =
      `${projectId}/${photoId}.jpg`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("project-photos")
      .upload(
        path,
        arrayBuffer,
        {
          contentType:
            "image/jpeg",
          upsert: true,
        }
      );

    if (uploadError) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "storage_upload",
        error:
          uploadError.message,
      });

      continue;
    }

    const {
      error: insertError,
    } = await supabase
      .from("photos")
      .insert({
        project_id:
          projectId,

        phase,

        storage_path:
          path,

        companycam_photo_id:
          photoId,

        alt_text_auto:
          `project photo — ${phase}`,
      });

    if (insertError) {
      failedCount++;

      failures.push({
        photoId,
        stage:
          "database_insert",
        error:
          insertError.message,
      });

      /*
       * Remove orphaned Storage file.
       */
      await supabase.storage
        .from("project-photos")
        .remove([path]);

      continue;
    }

    importedCount++;
  }

  const status =
    failedCount === 0
      ? "success"
      : importedCount > 0 ||
          alreadyImportedCount > 0
        ? "partial"
        : "failed";

  companyCamLog.info(
    "manual_import.complete",
    {
      companyCamProjectId:
        opts.ccProjectId,
      projectId,
      status,
      requested:
        opts.photoIds.length,
      imported:
        importedCount,
      alreadyImported:
        alreadyImportedCount,
      failed:
        failedCount,
    }
  );

  return {
    projectId,
    status,

    requested:
      opts.photoIds.length,

    importedCount,
    alreadyImportedCount,
    failedCount,

    failures:
      failures.slice(0, 10),
  };
}

/**
 * Delete every CompanyCam-imported LocalProof project.
 *
 * This is intentionally destructive and should only be used by the existing
 * administrative reset flow.
 */
export async function clearAllImports() {

  const supabase =
    createAdminClient();

  const {
    data: projects,
    error: projectsError,
  } = await supabase
    .from("projects")
    .select("id")
    .not(
      "companycam_project_id",
      "is",
      null
    );

  if (projectsError) {
    throw new Error(
      projectsError.message
    );
  }

  const projectIds =
    (projects ?? []).map(
      (project) =>
        project.id
    );

  if (
    projectIds.length === 0
  ) {
    return {
      deletedProjects: 0,
      deletedPhotoFiles: 0,
    };
  }

  const {
    data: photos,
    error: photosError,
  } = await supabase
    .from("photos")
    .select("storage_path")
    .in(
      "project_id",
      projectIds
    );

  if (photosError) {
    throw new Error(
      photosError.message
    );
  }

  const paths =
    (photos ?? [])
      .map(
        (photo) =>
          photo.storage_path
      )
      .filter(Boolean);

  if (paths.length > 0) {
    const {
      error: storageError,
    } = await supabase.storage
      .from("project-photos")
      .remove(paths);

    if (storageError) {
      companyCamLog.warn(
        "clear_imports.storage_cleanup_failed",
        {
          error:
            storageError.message,
          fileCount:
            paths.length,
        }
      );
    }
  }

  /*
   * Deleting projects should cascade to related DB photo/lead/review rows
   * according to your existing schema.
   */
  const {
    error: deleteError,
  } = await supabase
    .from("projects")
    .delete()
    .in("id", projectIds);

  if (deleteError) {
    throw new Error(
      deleteError.message
    );
  }

  companyCamLog.info(
    "clear_imports.complete",
    {
      deletedProjects:
        projectIds.length,

      deletedPhotoFiles:
        paths.length,
    }
  );

  return {
    deletedProjects:
      projectIds.length,

    deletedPhotoFiles:
      paths.length,
  };
}


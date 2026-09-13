import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyCamProject, listCompanyCamPhotos, stripHtml, guessPhase } from "@/lib/companycam";
import { stripNeedsReviewMarker } from "@/lib/needs-review";

/**
 * Maps your CompanyCam project labels to LocalProof's service_type enum.
 * Extend this as you add more labels in CompanyCam — the keys are matched
 * case-insensitively against each label's display value.
 */
const LABEL_TO_SERVICE_TYPE: Record<string, string> = {
  "roof replacement": "roof_replacement",
  "repair": "roof_repair",
  "storm damage": "storm_damage",
  "siding": "siding",
  "gutters": "gutters",
  "windows": "windows",
  // Your actual CompanyCam label is "Decks" (plural) — keeping the old
  // "decking"/"composite deck" spellings too in case those get used later.
  "decks": "deck_construction",
  "decking": "deck_construction",
  "deck": "deck_construction",
  "composite deck": "composite_deck",
  "chimney": "chimney",
  "skylight": "roof_repair", // closest existing category until a dedicated one is added
};

export function resolveServiceType(labels: string[]): { serviceType: string; matched: boolean } {
  for (const label of labels) {
    const key = label.toLowerCase().trim();
    if (LABEL_TO_SERVICE_TYPE[key]) {
      return { serviceType: LABEL_TO_SERVICE_TYPE[key], matched: true };
    }
  }
  return { serviceType: "roof_replacement", matched: false };
}

/**
 * Pulls one CompanyCam project's data + photos into Supabase as a draft
 * LocalProof project. Safe to call more than once for the same project —
 * it upserts on companycam_project_id and skips photos already imported.
 */
export async function importCompanyCamProject(ccProjectId: string) {
  const supabase = createAdminClient();
  const ccProject = await getCompanyCamProject(ccProjectId);

  const labels: string[] = (ccProject.labels ?? []).map(
    (l: any) => l.display_value ?? l.value ?? l
  );
  const { serviceType, matched } = resolveServiceType(labels);

  const description = stripHtml(ccProject.description);
  const projectDescription = matched
    ? description
    : `[SERVICE TYPE NEEDS REVIEW — no matching label found, defaulted to Roof Replacement]\n\n${description}`;

  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("companycam_project_id", ccProjectId)
    .maybeSingle();

  // CompanyCam's project "name" is really the job title ("Rebuild Deck
  // 12x24"), which is fine to show as the customer_name/title. Falls back
  // to the street address (never the unhelpful literal "Unnamed Project")
  // when a project was created with no name at all.
  const fallbackName = ccProject.address?.street_address_1
    ? `Job at ${ccProject.address.street_address_1}`
    : "New Job — needs a name";
  const projectFields = {
    customer_name: ccProject.name?.trim() || fallbackName,
    street_address_private: ccProject.address?.street_address_1 ?? "",
    city: ccProject.address?.city ?? "",
    state: ccProject.address?.state ?? "",
    zip: ccProject.address?.postal_code ?? "",
    latitude_public: ccProject.coordinates?.lat ?? 0,
    longitude_public: ccProject.coordinates?.lon ?? 0,
    service_type: serviceType,
    project_description: projectDescription,
    companycam_project_id: ccProjectId,
  };

  let projectId: string;

  if (existing) {
    projectId = existing.id;
    await supabase.from("projects").update(projectFields).eq("id", projectId);
  } else {
    const { data: created, error } = await supabase
      .from("projects")
      .insert({
        ...projectFields,
        slug: `draft-cc-${ccProjectId}`,
        publication_status: "draft",
        project_status: "completed",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    projectId = created.id;
  }

  // Skip photos already imported from this CompanyCam project (storage
  // path embeds the CompanyCam photo id — see path pattern below).
  const { data: existingPhotos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("project_id", projectId);
  const alreadyImported = new Set(
    (existingPhotos ?? []).map((p) => p.storage_path.split("/").pop()?.split(".")[0])
  );

  const ccPhotos = await listCompanyCamPhotos(ccProjectId);
  let importedCount = 0;
  const skipped: string[] = [];

  for (const photo of ccPhotos) {
    if (alreadyImported.has(photo.id)) continue;
    if (!photo.original_url) {
      skipped.push(`${photo.id}: no original_url in CompanyCam's response`);
      continue;
    }

    let imageRes: Response;
    try {
      imageRes = await fetch(photo.original_url);
    } catch (e) {
      skipped.push(`${photo.id}: fetch threw — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!imageRes.ok) {
      skipped.push(`${photo.id}: download failed, HTTP ${imageRes.status}`);
      continue;
    }
    const arrayBuffer = await imageRes.arrayBuffer();

    const phase = guessPhase(photo.tags);
    const path = `${projectId}/${photo.id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      skipped.push(`${photo.id}: Supabase storage upload failed — ${uploadError.message}`);
      continue;
    }

    await supabase.from("photos").insert({
      project_id: projectId,
      phase,
      storage_path: path,
      alt_text_auto: `${serviceType.replace(/_/g, " ")} project — ${phase} photo`,
    });
    importedCount++;
  }

  // Skips are common one-offs (a single broken photo shouldn't fail the
  // whole import) but silence is what made this bug invisible last time —
  // log every reason so a "0 photos" report is a 10-second log check
  // instead of another multi-message debugging thread.
  if (skipped.length > 0) {
    console.error(
      `CompanyCam import for project ${ccProjectId}: skipped ${skipped.length}/${ccPhotos.length} photo(s):\n${skipped.join("\n")}`
    );
  }

  return { projectId, serviceType, matched, importedCount, totalPhotos: ccPhotos.length, skippedReasons: skipped.slice(0, 5) };
}

/**
 * Called when the "Hertsworks" label is removed in CompanyCam. If the
 * matching project is still a draft (never published), it's cleaned up
 * automatically — no point leaving an orphaned half-finished import sitting
 * in /admin/imports forever. A project that's already been published is
 * left alone; use Unpublish + the manual delete button for those.
 */
export async function removeDraftOnLabelRemoved(ccProjectId: string) {
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, publication_status")
    .eq("companycam_project_id", ccProjectId)
    .maybeSingle();

  if (!project || project.publication_status === "published") {
    return { deleted: false };
  }

  const { data: photos } = await supabase.from("photos").select("storage_path").eq("project_id", project.id);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from("project-photos").remove(paths);
  }
  await supabase.from("photos").delete().eq("project_id", project.id);
  await supabase.from("projects").delete().eq("id", project.id);

  return { deleted: true, projectId: project.id };
}

/**
 * Re-checks one project's service type against its CompanyCam project's
 * *current* labels and updates it if a match is found. Exists because the
 * original import only ever looks at labels at the moment the "Hertsworks"
 * label got added — if the actual service label (Roof replacement, Decks,
 * Siding, etc.) gets added a little later, or fixed after being wrong, the
 * local draft never hears about it on its own. Safe to call any time; it
 * only ever moves a project from "unconfirmed" to a real label match, never
 * the other way, so it can't silently downgrade a type someone already set
 * by hand. Pass an already-fetched `ccProject` to skip a redundant API call
 * when the caller has one already (e.g. mid manual-import).
 */
export async function resyncServiceTypeFromCompanyCam(projectId: string, ccProject?: any) {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("companycam_project_id, project_description, service_type")
    .eq("id", projectId)
    .maybeSingle();

  if (!project?.companycam_project_id) {
    return { updated: false, reason: "not linked to a CompanyCam project" };
  }

  const cc = ccProject ?? (await getCompanyCamProject(project.companycam_project_id));
  const labels: string[] = (cc.labels ?? []).map((l: any) => l.display_value ?? l.value ?? l);
  const { serviceType, matched } = resolveServiceType(labels);

  if (!matched) {
    return { updated: false, reason: "no matching CompanyCam label found yet" };
  }

  await supabase
    .from("projects")
    .update({
      service_type: serviceType,
      project_description: stripNeedsReviewMarker(project.project_description),
    })
    .eq("id", projectId);

  return { updated: true, serviceType, changed: serviceType !== project.service_type };
}

/**
 * Manual import: staff picks a specific CompanyCam project and specific
 * photos in the admin UI (see /admin/companycam-import) and either creates
 * a new draft from them, or adds them onto an existing project. This is the
 * fallback for when the automatic "Hertsworks" webhook import doesn't fire,
 * pulls the wrong service type, or only catches part of the photo set.
 */
export async function manualImportCompanyCamPhotos(opts: {
  ccProjectId: string;
  photoIds: string[];
  targetProjectId?: string | null;
}) {
  const supabase = createAdminClient();
  const ccProject = await getCompanyCamProject(opts.ccProjectId);

  let projectId: string;

  if (opts.targetProjectId) {
    projectId = opts.targetProjectId;
    // Tag the target project with this CompanyCam id too (if it didn't
    // already have one) so future re-imports/re-syncs know they're linked.
    const { data: target } = await supabase
      .from("projects")
      .select("companycam_project_id")
      .eq("id", projectId)
      .maybeSingle();
    if (target && !target.companycam_project_id) {
      await supabase.from("projects").update({ companycam_project_id: opts.ccProjectId }).eq("id", projectId);
    }
    // Adding photos to an already-imported job is exactly when its
    // CompanyCam labels are most likely to have changed since the original
    // import (that's often *why* staff are re-pulling it) — re-check the
    // service type at the same time so this one click fixes both instead of
    // needing a separate manual edit afterward.
    await resyncServiceTypeFromCompanyCam(projectId, ccProject);
  } else {
    // A project row for this CompanyCam job may already exist — from the
    // automatic Hertsworks-label import, or from an earlier manual import —
    // even though none of it showed up as a pickable "existing draft" (e.g.
    // it's already published). Reuse it instead of blindly inserting a
    // second row with the same companycam_project_id, which the database's
    // unique constraint rejects outright.
    const { data: existingProject } = await supabase
      .from("projects")
      .select("id")
      .eq("companycam_project_id", opts.ccProjectId)
      .maybeSingle();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const labels: string[] = (ccProject.labels ?? []).map((l: any) => l.display_value ?? l.value ?? l);
      const { serviceType, matched } = resolveServiceType(labels);
      const description = stripHtml(ccProject.description);
      const projectDescription = matched
        ? description
        : `[SERVICE TYPE NEEDS REVIEW — no matching label found, defaulted to Roof Replacement]\n\n${description}`;
      const fallbackName = ccProject.address?.street_address_1
        ? `Job at ${ccProject.address.street_address_1}`
        : "New Job — needs a name";

      const { data: created, error } = await supabase
        .from("projects")
        .insert({
          customer_name: ccProject.name?.trim() || fallbackName,
          street_address_private: ccProject.address?.street_address_1 ?? "",
          city: ccProject.address?.city ?? "",
          state: ccProject.address?.state ?? "",
          zip: ccProject.address?.postal_code ?? "",
          latitude_public: ccProject.coordinates?.lat ?? 0,
          longitude_public: ccProject.coordinates?.lon ?? 0,
          service_type: serviceType,
          project_description: projectDescription,
          companycam_project_id: opts.ccProjectId,
          slug: `draft-cc-${opts.ccProjectId}`,
          publication_status: "draft",
          project_status: "completed",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      projectId = created.id;
    }
  }

  const { data: existingPhotos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("project_id", projectId);
  const alreadyImported = new Set(
    (existingPhotos ?? []).map((p) => p.storage_path.split("/").pop()?.split(".")[0])
  );

  const allPhotos = await listCompanyCamPhotos(opts.ccProjectId);
  const wanted = new Set(opts.photoIds);
  let importedCount = 0;
  const skipped: string[] = [];

  for (const photo of allPhotos) {
    if (!wanted.has(photo.id)) continue;
    if (alreadyImported.has(photo.id)) continue;
    if (!photo.original_url) {
      skipped.push(`${photo.id}: no original_url in CompanyCam's response`);
      continue;
    }

    let imageRes: Response;
    try {
      imageRes = await fetch(photo.original_url);
    } catch (e) {
      skipped.push(`${photo.id}: fetch threw — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!imageRes.ok) {
      skipped.push(`${photo.id}: download failed, HTTP ${imageRes.status}`);
      continue;
    }
    const arrayBuffer = await imageRes.arrayBuffer();

    const phase = guessPhase(photo.tags);
    const path = `${projectId}/${photo.id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      skipped.push(`${photo.id}: Supabase storage upload failed — ${uploadError.message}`);
      continue;
    }

    await supabase.from("photos").insert({
      project_id: projectId,
      phase,
      storage_path: path,
      alt_text_auto: `project photo — ${phase}`,
    });
    importedCount++;
  }

  if (skipped.length > 0) {
    console.error(
      `Manual CompanyCam import for project ${opts.ccProjectId}: skipped ${skipped.length}/${opts.photoIds.length} requested photo(s):\n${skipped.join("\n")}`
    );
  }

  return { projectId, importedCount, requested: opts.photoIds.length, skippedReasons: skipped.slice(0, 5) };
}

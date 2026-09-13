import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyCamProject, listCompanyCamPhotos, stripHtml, guessPhase } from "@/lib/companycam";

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

function resolveServiceType(labels: string[]): { serviceType: string; matched: boolean } {
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

  for (const photo of ccPhotos) {
    if (alreadyImported.has(photo.id)) continue;
    if (!photo.original_url) continue;

    const imageRes = await fetch(photo.original_url);
    if (!imageRes.ok) continue;
    const arrayBuffer = await imageRes.arrayBuffer();

    const phase = guessPhase(photo.tags);
    const path = `${projectId}/${photo.id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) continue;

    await supabase.from("photos").insert({
      project_id: projectId,
      phase,
      storage_path: path,
      alt_text_auto: `${serviceType.replace(/_/g, " ")} project — ${phase} photo`,
    });
    importedCount++;
  }

  return { projectId, serviceType, matched, importedCount, totalPhotos: ccPhotos.length };
}

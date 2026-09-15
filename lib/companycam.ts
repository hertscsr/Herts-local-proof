/**
 * CompanyCam API helpers
 */

const COMPANYCAM_API_BASE = "https://api.companycam.com/v2";

/**
 * Remove HTML from CompanyCam descriptions/notepad content.
 */
export function stripHtml(
  html: string | null
): string {
  if (!html) return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

/**
 * Basic CompanyCam project summary used by project search.
 */
export interface CCProjectSummary {
  id: string;
  name: string;
  status?: string;
  address?: {
    street_address_1?: string;
    street_address_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  labels?: any[];
  photo_count?: number;
  [key: string]: any;
}

/**
 * Get the CompanyCam API key from the server environment.
 */
function getCompanyCamApiKey(): string {
  const apiKey =
    process.env.COMPANYCAM_API_KEY;

  if (!apiKey) {
    throw new Error(
      "COMPANYCAM_API_KEY is not configured"
    );
  }

  return apiKey;
}

/**
 * Standard authenticated CompanyCam request.
 */
async function companyCamFetch(
  path: string
): Promise<any> {
  const apiKey =
    getCompanyCamApiKey();

  const response = await fetch(
    `${COMPANYCAM_API_BASE}${path}`,
    {
      headers: {
        Authorization:
          `Bearer ${apiKey}`,
        Accept:
          "application/json",
      },

      cache: "no-store",
    }
  );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      `CompanyCam API request failed: ${response.status} ${response.statusText}${
        responseText
          ? ` — ${responseText}`
          : ""
      }`
    );
  }

  return response.json();
}

/**
 * Search/list CompanyCam projects.
 */
export async function listCompanyCamProjects(
  query?: string
): Promise<CCProjectSummary[]> {
  const params =
    new URLSearchParams();

  if (query?.trim()) {
    params.set(
      "query",
      query.trim()
    );
  }

  const queryString =
    params.toString();

  const data =
    await companyCamFetch(
      `/projects${
        queryString
          ? `?${queryString}`
          : ""
      }`
    );

  const projects =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.projects)
        ? data.projects
        : [];

  return projects.map(
    (project: any) => ({
      ...project,

      id:
        String(project.id),

      name:
        project.name ?? "",
    })
  );
}

/**
 * Retrieve one CompanyCam project.
 */
export async function getCompanyCamProject(
  id: string
) {
  if (!id) {
    throw new Error(
      "CompanyCam project ID is required"
    );
  }

  return companyCamFetch(
    `/projects/${encodeURIComponent(
      id
    )}`
  );
}

/**
 * Normalized CompanyCam photo shape used by LocalProof.
 */
export interface CCPhoto {
  id: string;

  original_url?: string | null;

  tags: string[];

  [key: string]: any;
}

/**
 * Normalize a CompanyCam photo tag.
 *
 * CompanyCam may return tags as strings or objects.
 */
function normalizePhotoTag(
  tag: any
): string {
  if (typeof tag === "string") {
    return tag.trim();
  }

  if (!tag) {
    return "";
  }

  return String(
    tag.value ??
      tag.display_value ??
      tag.name ??
      ""
  ).trim();
}

/**
 * Retrieve photos for a CompanyCam project.
 */
export async function listCompanyCamPhotos(
  projectId: string
): Promise<CCPhoto[]> {
  if (!projectId) {
    throw new Error(
      "CompanyCam project ID is required"
    );
  }

  const data =
    await companyCamFetch(
      `/projects/${encodeURIComponent(
        projectId
      )}/photos`
    );

  const photos =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.photos)
        ? data.photos
        : [];

  return photos.map(
    (photo: any): CCPhoto => ({
      ...photo,

      id:
        String(photo.id),

      original_url:
        photo.original_url ??
        photo.uri ??
        photo.url ??
        null,

      tags:
        (photo.tags ?? [])
          .map(
            (tag: any) =>
              normalizePhotoTag(tag)
          )
          .filter(Boolean),
    })
  );
}

/**
 * Guess before/during/after from a photo's tags.
 *
 * Defaults to "during" because most jobsite photos do not
 * currently have an explicit phase tag.
 */
export function guessPhase(
  tags: string[]
):
  | "before"
  | "during"
  | "after" {
  const joined =
    (tags ?? [])
      .join(" ")
      .toLowerCase();

  if (
    joined.includes("before") ||
    joined.includes("pre job") ||
    joined.includes("pre-job") ||
    joined.includes("existing")
  ) {
    return "before";
  }

  if (
    joined.includes("after") ||
    joined.includes("completed") ||
    joined.includes("complete") ||
    joined.includes("finished") ||
    joined.includes("final")
  ) {
    return "after";
  }

  return "during";
}

/**
 * =========================================================
 * LOCALPROOF PHOTO RULES
 * =========================================================
 *
 * CompanyCam workflow:
 *
 * PROJECT LABEL:
 * Hertsworks
 *
 * Determines whether the CompanyCam project belongs
 * in Herts LocalProof.
 *
 * PHOTO TAG:
 * LocalProof
 *
 * Determines which individual photos are eligible
 * for automatic LocalProof import.
 *
 * Maximum:
 * 5 photos per automatic import.
 */

/**
 * Hard maximum of CompanyCam photos automatically
 * selected for LocalProof.
 */
export const MAX_LOCALPROOF_PHOTOS =
  5;

/**
 * Check whether an individual CompanyCam photo
 * has the LocalProof tag.
 *
 * Comparison is case-insensitive so:
 *
 * LocalProof
 * localproof
 * LOCALPROOF
 *
 * are treated the same.
 */
export function hasLocalProofTag(
  photo: {
    tags?: string[] | null;
  }
): boolean {
  const tags =
    photo.tags ?? [];

  return tags.some(
    (tag) =>
      String(tag)
        .trim()
        .toLowerCase() ===
      "localproof"
  );
}

/**
 * Convenience helper if other parts of the application
 * need to select the LocalProof photos directly.
 *
 * Only tagged photos are returned and the result
 * is capped at MAX_LOCALPROOF_PHOTOS.
 */
export function selectLocalProofPhotos<
  T extends {
    tags?: string[] | null;
  }
>(
  photos: T[]
): T[] {
  return photos
    .filter(
      (photo) =>
        hasLocalProofTag(photo)
    )
    .slice(
      0,
      MAX_LOCALPROOF_PHOTOS
    );
}
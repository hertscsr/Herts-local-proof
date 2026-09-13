const BASE = "https://api.companycam.com/v2";

function headers() {
  return {
    Authorization: `Bearer ${process.env.COMPANYCAM_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Strips CompanyCam's rich-text HTML description down to plain text. */
export function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export interface CCProjectSummary {
  id: string;
  name: string;
  address: {
    street_address_1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  };
  coordinates: { lat: number; lon: number } | null;
  description: string | null;
  photo_count: number;
  thumbnail_url: string | null;
}

function simplifyProject(p: any): CCProjectSummary {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    coordinates: p.coordinates,
    description: p.description,
    photo_count: p.photo_count,
    thumbnail_url: p.feature_image?.find((i: any) => i.type === "web")?.url ?? null,
  };
}

export async function listCompanyCamProjects(query?: string): Promise<CCProjectSummary[]> {
  // CompanyCam has no separate /projects/search endpoint — filtering by
  // name/address is done via the ?query= param on the main /projects list.
  const url = query
    ? `${BASE}/projects?query=${encodeURIComponent(query)}&per_page=25`
    : `${BASE}/projects?per_page=25`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`CompanyCam list failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }
  const json = await res.json();
  return (Array.isArray(json) ? json : json.data ?? []).map(simplifyProject);
}

export async function getCompanyCamProject(id: string) {
  const res = await fetch(`${BASE}/projects/${id}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`CompanyCam project fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export interface CCPhoto {
  id: string;
  original_url: string;
  tags: string[];
}

export async function listCompanyCamPhotos(projectId: string): Promise<CCPhoto[]> {
  const res = await fetch(`${BASE}/projects/${projectId}/photos?per_page=50`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CompanyCam photos fetch failed: ${res.status}`);
  const json = await res.json();
  const photos = json.data ?? json ?? [];
  return photos.map((p: any) => ({
    id: p.id,
    original_url: p.uris?.find((u: any) => u.type === "original")?.url ?? p.uris?.[0]?.url,
    tags: (p.tags ?? []).map((t: any) => (typeof t === "string" ? t : t.value)),
  }));
}

/** Guesses before/during/after from a photo's tags; defaults to "during" since most jobsite tags don't carry phase info yet. */
export function guessPhase(tags: string[]): "before" | "during" | "after" {
  const joined = tags.join(" ").toLowerCase();
  if (joined.includes("before")) return "before";
  if (joined.includes("after") || joined.includes("complete") || joined.includes("finish")) return "after";
  return "during";
}

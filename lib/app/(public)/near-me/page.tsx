import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { distanceInMiles } from "@/lib/geo";
import SearchControls from "./search-controls";

// Leaflet touches `window`, so the map can only render client-side — load it
// with ssr disabled instead of importing it directly into this server page.
const ProjectMap = dynamic(() => import("./project-map"), {
  ssr: false,
  loading: () => (
    <div className="mt-6 flex h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export const metadata = {
  title: "Roofing, Siding & Deck Projects Near You",
  description:
    "See completed roofing, siding, deck, and gutter projects Herts Roofing & Construction has finished near your neighborhood.",
};

const PAGE_SIZE = 24;

interface SearchParams {
  zip?: string;
  service?: string;
  lat?: string;
  lng?: string;
  city?: string;
  page?: string;
}

export default async function NearMePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();

  const visitorLat = searchParams.lat ? parseFloat(searchParams.lat) : null;
  const visitorLng = searchParams.lng ? parseFloat(searchParams.lng) : null;
  const hasLocation = visitorLat != null && visitorLng != null && !Number.isNaN(visitorLat) && !Number.isNaN(visitorLng);
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // The "browse by area" list — every distinct city with a published
  // project and how many it has, so a visitor (or you) can jump straight
  // to one area instead of scrolling a huge flat list. Cheap enough to
  // pull every city/state pair even with a lot of projects, since it's
  // just two text columns.
  const { data: allCityRows } = await supabase.from("public_projects").select("city, state");
  const cityCounts = new Map<string, { city: string; state: string; count: number }>();
  for (const row of allCityRows ?? []) {
    const key = `${row.city}|${row.state}`;
    const existing = cityCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      cityCounts.set(key, { city: row.city, state: row.state, count: 1 });
    }
  }
  const cityList = Array.from(cityCounts.values()).sort((a, b) => b.count - a.count);

  let query = supabase.from("public_projects").select("*", { count: "exact" });
  if (searchParams.service) {
    query = query.eq("service_type", searchParams.service);
  }
  if (searchParams.city) {
    query = query.eq("city", searchParams.city);
  }
  // Exact-ZIP filtering only kicks in when we don't have real coordinates
  // for the search (the ZIP box normally geocodes first — see
  // search-controls.tsx — so this is just the fallback for when that
  // free geocoder couldn't find the ZIP).
  if (searchParams.zip && !hasLocation) {
    query = query.eq("zip", searchParams.zip);
  }

  // No pagination once we're sorting by distance — visitor/ZIP location
  // search is a small, specific result set, not something to page through.
  if (!hasLocation) {
    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  } else {
    query = query.limit(200);
  }

  const { data: projects, count: totalCount } = await query;
  const projectIds = (projects ?? []).map((p) => p.id);

  // One thumbnail per project (first uploaded photo) so cards aren't just
  // text — a real trust signal for a visitor scanning the list.
  const { data: photoRows } = projectIds.length
    ? await supabase
        .from("photos")
        .select("project_id, storage_path, upload_date")
        .in("project_id", projectIds)
        .order("upload_date", { ascending: true })
    : { data: [] };

  const thumbnailByProject = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!thumbnailByProject.has(photo.project_id)) {
      thumbnailByProject.set(
        photo.project_id,
        supabase.storage.from("project-photos").getPublicUrl(photo.storage_path).data.publicUrl
      );
    }
  }

  // Average rating + count from approved reviews, shown as social proof on the card.
  const { data: reviewRows } = projectIds.length
    ? await supabase
        .from("reviews")
        .select("project_id, rating")
        .in("project_id", projectIds)
        .eq("approved_for_website", true)
    : { data: [] };

  const ratingByProject = new Map<string, { avg: number; count: number }>();
  for (const r of reviewRows ?? []) {
    const existing = ratingByProject.get(r.project_id) ?? { avg: 0, count: 0 };
    const total = existing.avg * existing.count + r.rating;
    const count = existing.count + 1;
    ratingByProject.set(r.project_id, { avg: total / count, count });
  }

  const withDistance = (projects ?? []).map((p) => ({
    ...p,
    distance: hasLocation
      ? distanceInMiles(visitorLat as number, visitorLng as number, p.latitude_public, p.longitude_public)
      : null,
    thumbnail: thumbnailByProject.get(p.id) ?? null,
    rating: ratingByProject.get(p.id) ?? null,
  }));

  // Nearest-first when we have a real location to sort from.
  if (hasLocation) {
    withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }

  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;

  function pageLink(targetPage: number) {
    const params = new URLSearchParams();
    if (searchParams.service) params.set("service", searchParams.service);
    if (searchParams.city) params.set("city", searchParams.city);
    if (searchParams.zip) params.set("zip", searchParams.zip);
    params.set("page", String(targetPage));
    return `/near-me?${params.toString()}`;
  }

  function cityLink(city: string) {
    const params = new URLSearchParams();
    if (searchParams.service) params.set("service", searchParams.service);
    params.set("city", city);
    return `/near-me?${params.toString()}`;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">See Herts Projects Near You</h1>
      <p className="mt-2 text-slate-600">
        {hasLocation ? withDistance.length : totalCount ?? withDistance.length} projects
        {searchParams.city ? ` in ${searchParams.city}, ${withDistance[0]?.state ?? ""}` : " near this area"}.
      </p>

      <SearchControls />

      {cityList.length > 1 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-slate-700">Browse by area:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="/near-me"
              className={`rounded-full border px-3 py-1 text-sm ${
                !searchParams.city ? "border-brand-accent bg-brand-accent text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              All areas
            </a>
            {cityList.map((c) => (
              <a
                key={`${c.city}|${c.state}`}
                href={cityLink(c.city)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  searchParams.city === c.city
                    ? "border-brand-accent bg-brand-accent text-white"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                {c.city}, {c.state} ({c.count})
              </a>
            ))}
          </div>
        </div>
      )}

      <ProjectMap
        projects={withDistance.map((p) => ({
          id: p.id,
          slug: p.slug,
          city: p.city,
          state: p.state,
          service_type: p.service_type,
          latitude_public: p.latitude_public,
          longitude_public: p.longitude_public,
        }))}
      />

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {withDistance.map((project) => (
          <a
            key={project.id}
            href={`/projects/${project.slug}`}
            className="block overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:shadow-md"
          >
            {project.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.thumbnail} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
                No photo yet
              </div>
            )}
            <div className="p-4">
              <div className="text-sm font-semibold uppercase text-brand-accent">
                {project.service_type?.replace(/_/g, " ")}
              </div>
              <div className="mt-1 font-medium">
                {project.city}, {project.state}
              </div>
              {project.distance != null && (
                <div className="text-sm text-slate-500">
                  {project.distance.toFixed(1)} miles away
                </div>
              )}
              {project.rating && (
                <div className="mt-1 text-sm text-amber-500">
                  {"★".repeat(Math.round(project.rating.avg))}
                  {"☆".repeat(5 - Math.round(project.rating.avg))}{" "}
                  <span className="text-slate-500">
                    ({project.rating.count} review{project.rating.count === 1 ? "" : "s"})
                  </span>
                </div>
              )}
              {project.completion_date && (
                <div className="mt-1 text-xs text-slate-400">
                  Completed {new Date(project.completion_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </div>
              )}
              <div className="mt-2 text-sm text-slate-600">
                {project.manufacturer} {project.product}
                {project.product_color ? ` — ${project.product_color}` : ""}
              </div>
            </div>
          </a>
        ))}
      </div>

      {!hasLocation && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          {page > 1 && (
            <a href={pageLink(page - 1)} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              ← Previous
            </a>
          )}
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a href={pageLink(page + 1)} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Next →
            </a>
          )}
        </div>
      )}
    </main>
  );
}

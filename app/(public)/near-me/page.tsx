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

interface SearchParams {
  zip?: string;
  service?: string;
  lat?: string;
  lng?: string;
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

  let query = supabase.from("public_projects").select("*").limit(50);
  if (searchParams.service) {
    query = query.eq("service_type", searchParams.service);
  }
  // Exact-ZIP filtering only kicks in when we don't have real coordinates
  // for the search (the ZIP box normally geocodes first — see
  // search-controls.tsx — so this is just the fallback for when that
  // free geocoder couldn't find the ZIP).
  if (searchParams.zip && !hasLocation) {
    query = query.eq("zip", searchParams.zip);
  }

  const { data: projects } = await query;
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">See Herts Projects Near You</h1>
      <p className="mt-2 text-slate-600">
        {withDistance.length} projects near this area.
      </p>

      <SearchControls />

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
    </main>
  );
}

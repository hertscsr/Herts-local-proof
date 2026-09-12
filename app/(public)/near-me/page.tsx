import { createClient } from "@/lib/supabase/server";
import { distanceInMiles } from "@/lib/geo";

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

  let query = supabase.from("public_projects").select("*").limit(50);
  if (searchParams.service) {
    query = query.eq("service_type", searchParams.service);
  }
  if (searchParams.zip) {
    query = query.eq("zip", searchParams.zip);
  }

  const { data: projects } = await query;

  const visitorLat = searchParams.lat ? parseFloat(searchParams.lat) : null;
  const visitorLng = searchParams.lng ? parseFloat(searchParams.lng) : null;

  const withDistance = (projects ?? []).map((p) => ({
    ...p,
    distance:
      visitorLat != null && visitorLng != null
        ? distanceInMiles(visitorLat, visitorLng, p.latitude_public, p.longitude_public)
        : null,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">See Herts Projects Near You</h1>
      <p className="mt-2 text-slate-600">
        {withDistance.length} projects near this area.
      </p>

      {/* TODO: filter chips (Roofing/Siding/Decks/Gutters/Windows), ZIP input,
          "use my location" browser geolocation prompt, and the actual map
          component (jittered pins from latitude_public/longitude_public —
          never the private columns) go here. Cards below are the data shape. */}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {withDistance.map((project) => (
          <a
            key={project.id}
            href={`/projects/${project.slug}`}
            className="block rounded-lg border border-slate-200 p-4 shadow-sm hover:shadow-md"
          >
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
            <div className="mt-2 text-sm text-slate-600">
              {project.manufacturer} {project.product}
              {project.product_color ? ` — ${project.product_color}` : ""}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}

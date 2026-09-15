import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { distanceInMiles } from "@/lib/geo";
import SearchControls from "./search-controls";

/*
 * Leaflet touches `window`, so the map must render client-side.
 */
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

/*
 * Validate geographic coordinates.
 *
 * IMPORTANT:
 * 0,0 is used by our CompanyCam import process as a temporary
 * placeholder. It must NEVER be treated as a real project location.
 */
function hasValidCoordinates(
  latitude: unknown,
  longitude: unknown
): boolean {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  if (lat === 0 && lng === 0) {
    return false;
  }

  if (lat < -90 || lat > 90) {
    return false;
  }

  if (lng < -180 || lng > 180) {
    return false;
  }

  return true;
}

/*
 * Validate visitor coordinates separately.
 */
function getVisitorCoordinates(
  latValue?: string,
  lngValue?: string
): { lat: number; lng: number } | null {
  if (!latValue || !lngValue) {
    return null;
  }

  const lat = Number.parseFloat(latValue);
  const lng = Number.parseFloat(lngValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90) {
    return null;
  }

  if (lng < -180 || lng > 180) {
    return null;
  }

  return {
    lat,
    lng,
  };
}

export default async function NearMePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();

  /*
   * ---------------------------------------------------------
   * VISITOR LOCATION
   * ---------------------------------------------------------
   */

  const visitorLocation = getVisitorCoordinates(
    searchParams.lat,
    searchParams.lng
  );

  const hasLocation = visitorLocation !== null;

  const page = Math.max(
    1,
    Number.parseInt(searchParams.page ?? "1", 10) || 1
  );

  /*
   * ---------------------------------------------------------
   * BROWSE BY AREA
   * ---------------------------------------------------------
   */

  const { data: allCityRows } = await supabase
    .from("public_projects")
    .select("city, state");

  const cityCounts = new Map<
    string,
    {
      city: string;
      state: string;
      count: number;
    }
  >();

  for (const row of allCityRows ?? []) {
    if (!row.city || !row.state) {
      continue;
    }

    const key = `${row.city}|${row.state}`;

    const existing = cityCounts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      cityCounts.set(key, {
        city: row.city,
        state: row.state,
        count: 1,
      });
    }
  }

  const cityList = Array.from(cityCounts.values()).sort(
    (a, b) => b.count - a.count
  );

  /*
   * ---------------------------------------------------------
   * PROJECT QUERY
   * ---------------------------------------------------------
   */

  let query = supabase
    .from("public_projects")
    .select("*", {
      count: "exact",
    });

  if (searchParams.service) {
    query = query.eq(
      "service_type",
      searchParams.service
    );
  }

  if (searchParams.city) {
    query = query.eq(
      "city",
      searchParams.city
    );
  }

  /*
   * Normally the ZIP search is converted into coordinates first.
   *
   * If geocoding fails, fall back to an exact ZIP match.
   */
  if (searchParams.zip && !hasLocation) {
    query = query.eq(
      "zip",
      searchParams.zip
    );
  }

  /*
   * When sorting by distance, pull a larger set and sort it here.
   *
   * Otherwise use normal pagination.
   */
  if (!hasLocation) {
    query = query.range(
      (page - 1) * PAGE_SIZE,
      page * PAGE_SIZE - 1
    );
  } else {
    query = query.limit(200);
  }

  const {
    data: projects,
    count: totalCount,
  } = await query;

  const projectRows = projects ?? [];

  const projectIds = projectRows.map(
    (project) => project.id
  );

  /*
   * ---------------------------------------------------------
   * PROJECT PHOTOS
   * ---------------------------------------------------------
   */

  const { data: photoRows } =
    projectIds.length > 0
      ? await supabase
          .from("photos")
          .select(
            "project_id, storage_path, upload_date"
          )
          .in(
            "project_id",
            projectIds
          )
          .order(
            "upload_date",
            {
              ascending: true,
            }
          )
      : {
          data: [],
        };

  const thumbnailByProject =
    new Map<string, string>();

  for (const photo of photoRows ?? []) {
    if (
      !photo.project_id ||
      !photo.storage_path
    ) {
      continue;
    }

    /*
     * Only use the first photo returned for each project.
     */
    if (
      thumbnailByProject.has(
        photo.project_id
      )
    ) {
      continue;
    }

    const {
      data: publicUrlData,
    } = supabase.storage
      .from("project-photos")
      .getPublicUrl(
        photo.storage_path
      );

    thumbnailByProject.set(
      photo.project_id,
      publicUrlData.publicUrl
    );
  }

  /*
   * ---------------------------------------------------------
   * PROJECT REVIEWS
   * ---------------------------------------------------------
   */

  const { data: reviewRows } =
    projectIds.length > 0
      ? await supabase
          .from("reviews")
          .select(
            "project_id, rating"
          )
          .in(
            "project_id",
            projectIds
          )
          .eq(
            "approved_for_website",
            true
          )
      : {
          data: [],
        };

  const ratingByProject =
    new Map<
      string,
      {
        avg: number;
        count: number;
      }
    >();

  for (const review of reviewRows ?? []) {
    if (
      !review.project_id ||
      typeof review.rating !== "number"
    ) {
      continue;
    }

    const existing =
      ratingByProject.get(
        review.project_id
      ) ?? {
        avg: 0,
        count: 0,
      };

    const total =
      existing.avg *
        existing.count +
      review.rating;

    const count =
      existing.count + 1;

    ratingByProject.set(
      review.project_id,
      {
        avg: total / count,
        count,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * DISTANCE CALCULATION
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * A project with missing or placeholder coordinates must NOT
   * be used for distance calculations.
   *
   * Zion Grove currently has 0,0, so it will correctly receive
   * distance=null until its real approximate public coordinates
   * are generated.
   */

  const withDistance = projectRows.map(
    (project) => {
      const projectHasValidCoordinates =
        hasValidCoordinates(
          project.latitude_public,
          project.longitude_public
        );

      let distance: number | null = null;

      if (
        visitorLocation &&
        projectHasValidCoordinates
      ) {
        distance = distanceInMiles(
          visitorLocation.lat,
          visitorLocation.lng,
          Number(
            project.latitude_public
          ),
          Number(
            project.longitude_public
          )
        );
      }

      return {
        ...project,

        distance,

        hasValidCoordinates:
          projectHasValidCoordinates,

        thumbnail:
          thumbnailByProject.get(
            project.id
          ) ?? null,

        rating:
          ratingByProject.get(
            project.id
          ) ?? null,
      };
    }
  );

  /*
   * Sort projects with real coordinates first.
   *
   * Projects without valid coordinates remain visible as cards,
   * but they are placed after projects whose distance is known.
   */
  if (hasLocation) {
    withDistance.sort(
      (a, b) =>
        (a.distance ?? Infinity) -
        (b.distance ?? Infinity)
    );
  }

  /*
   * ---------------------------------------------------------
   * SAFE MAP PROJECTS
   * ---------------------------------------------------------
   *
   * This is the critical map safety layer.
   *
   * Invalid coordinates, missing coordinates and 0,0 are NEVER
   * sent to Leaflet.
   */

  const mapProjects = withDistance
    .filter(
      (project) =>
        project.hasValidCoordinates
    )
    .map((project) => ({
      id: project.id,
      slug: project.slug,
      city: project.city,
      state: project.state,
      service_type:
        project.service_type,

      latitude_public: Number(
        project.latitude_public
      ),

      longitude_public: Number(
        project.longitude_public
      ),
    }));

  /*
   * ---------------------------------------------------------
   * PAGINATION
   * ---------------------------------------------------------
   */

  const totalPages =
    totalCount && totalCount > 0
      ? Math.ceil(
          totalCount /
            PAGE_SIZE
        )
      : 1;

  function pageLink(
    targetPage: number
  ) {
    const params =
      new URLSearchParams();

    if (searchParams.service) {
      params.set(
        "service",
        searchParams.service
      );
    }

    if (searchParams.city) {
      params.set(
        "city",
        searchParams.city
      );
    }

    if (searchParams.zip) {
      params.set(
        "zip",
        searchParams.zip
      );
    }

    params.set(
      "page",
      String(targetPage)
    );

    return `/near-me?${params.toString()}`;
  }

  function cityLink(
    city: string
  ) {
    const params =
      new URLSearchParams();

    if (searchParams.service) {
      params.set(
        "service",
        searchParams.service
      );
    }

    params.set(
      "city",
      city
    );

    return `/near-me?${params.toString()}`;
  }

  /*
   * ---------------------------------------------------------
   * PAGE
   * ---------------------------------------------------------
   */

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">
        See Herts Projects Near You
      </h1>

      <p className="mt-2 text-slate-600">
        {hasLocation
          ? withDistance.length
          : totalCount ??
            withDistance.length}{" "}
        projects
        {searchParams.city
          ? ` in ${
              searchParams.city
            }, ${
              withDistance[0]
                ?.state ?? ""
            }`
          : " near this area"}
        .
      </p>

      <SearchControls />

      {/* Browse by area */}

      {cityList.length > 1 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-slate-700">
            Browse by area:
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="/near-me"
              className={`rounded-full border px-3 py-1 text-sm ${
                !searchParams.city
                  ? "border-brand-accent bg-brand-accent text-white"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              All areas
            </a>

            {cityList.map(
              (area) => (
                <a
                  key={`${area.city}|${area.state}`}
                  href={cityLink(
                    area.city
                  )}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    searchParams.city ===
                    area.city
                      ? "border-brand-accent bg-brand-accent text-white"
                      : "border-slate-300 text-slate-700"
                  }`}
                >
                  {area.city},{" "}
                  {area.state} (
                  {area.count})
                </a>
              )
            )}
          </div>
        </div>
      )}

      {/* Map */}

      <ProjectMap
        projects={mapProjects}
      />

      {withDistance.length >
        mapProjects.length && (
        <p className="mt-2 text-xs text-slate-400">
          Some projects are not
          displayed on the map because
          their approximate map location
          has not been generated yet.
        </p>
      )}

      {/* Project cards */}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {withDistance.map(
          (project) => (
            <a
              key={project.id}
              href={`/projects/${project.slug}`}
              className="block overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:shadow-md"
            >
              {project.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    project.thumbnail
                  }
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
                  No photo yet
                </div>
              )}

              <div className="p-4">
                <div className="text-sm font-semibold uppercase text-brand-accent">
                  {project.service_type?.replace(
                    /_/g,
                    " "
                  )}
                </div>

                <div className="mt-1 font-medium">
                  {project.city},{" "}
                  {project.state}
                </div>

                {project.distance !==
                  null && (
                  <div className="text-sm text-slate-500">
                    {project.distance.toFixed(
                      1
                    )}{" "}
                    miles away
                  </div>
                )}

                {project.rating && (
                  <div className="mt-1 text-sm text-amber-500">
                    {"★".repeat(
                      Math.round(
                        project.rating
                          .avg
                      )
                    )}

                    {"☆".repeat(
                      5 -
                        Math.round(
                          project.rating
                            .avg
                        )
                    )}{" "}

                    <span className="text-slate-500">
                      (
                      {
                        project.rating
                          .count
                      }{" "}
                      review
                      {project.rating
                        .count === 1
                        ? ""
                        : "s"}
                      )
                    </span>
                  </div>
                )}

                {project.completion_date && (
                  <div className="mt-1 text-xs text-slate-400">
                    Completed{" "}
                    {new Date(
                      project.completion_date
                    ).toLocaleDateString(
                      "en-US",
                      {
                        month:
                          "short",
                        year:
                          "numeric",
                      }
                    )}
                  </div>
                )}

                {(project.manufacturer ||
                  project.product ||
                  project.product_color) && (
                  <div className="mt-2 text-sm text-slate-600">
                    {project.manufacturer}{" "}
                    {project.product}

                    {project.product_color
                      ? ` — ${project.product_color}`
                      : ""}
                  </div>
                )}
              </div>
            </a>
          )
        )}
      </div>

      {/* Pagination */}

      {!hasLocation &&
        totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            {page > 1 && (
              <a
                href={pageLink(
                  page - 1
                )}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                ← Previous
              </a>
            )}

            <span className="text-sm text-slate-500">
              Page {page} of{" "}
              {totalPages}
            </span>

            {page <
              totalPages && (
              <a
                href={pageLink(
                  page + 1
                )}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Next →
              </a>
            )}
          </div>
        )}
    </main>
  );
}
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeSlug } from "@/lib/slug";
import { jitterCoordinates } from "@/lib/geo";
import { stripNeedsReviewMarker } from "@/lib/needs-review";

interface Params {
  params: { id: string };
}

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const GEOCODE_TIMEOUT_MS = 8000;

/**
 * Validate coordinates before saving them.
 */
function isValidCoordinatePair(
  lat: number,
  lng: number
): boolean {
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

/**
 * Call Nominatim safely.
 *
 * This is server-side only. Exact homeowner address coordinates
 * are never returned to the browser by this helper.
 */
async function geocodeWithNominatim(
  params: URLSearchParams
): Promise<{ lat: number; lng: number } | null> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GEOCODE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${NOMINATIM_URL}?${params.toString()}`,
      {
        method: "GET",

        headers: {
          "User-Agent":
            "HertsLocalProof/1.0 (project publishing)",
          Accept: "application/json",
        },

        signal: controller.signal,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        "[project-publish] Nominatim request failed",
        {
          status: response.status,
        }
      );

      return null;
    }

    const results: unknown =
      await response.json();

    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      return null;
    }

    const first = results[0];

    if (
      !first ||
      typeof first !== "object"
    ) {
      return null;
    }

    const record = first as {
      lat?: string;
      lon?: string;
    };

    const lat =
      Number.parseFloat(record.lat ?? "");

    const lng =
      Number.parseFloat(record.lon ?? "");

    if (
      !isValidCoordinatePair(lat, lng)
    ) {
      return null;
    }

    return {
      lat,
      lng,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      console.warn(
        "[project-publish] Geocoding timed out"
      );
    } else {
      console.error(
        "[project-publish] Geocoding failed",
        error instanceof Error
          ? error.message
          : String(error)
      );
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try the full private homeowner address first.
 *
 * These coordinates are private and are never used directly
 * on the public map.
 */
async function geocodePrivateAddress(project: {
  street_address_private?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const street =
    project.street_address_private?.trim();

  const city =
    project.city?.trim();

  const state =
    project.state?.trim();

  const zip =
    project.zip?.trim();

  if (!street || !city || !state) {
    return null;
  }

  const addressParts = [
    street,
    city,
    state,
    zip,
    "USA",
  ].filter(Boolean);

  const params =
    new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      q: addressParts.join(", "),
    });

  return geocodeWithNominatim(params);
}

/**
 * ZIP-level fallback.
 *
 * If the exact address cannot be geocoded, we still want the
 * project represented approximately on the map.
 *
 * ZIP coordinates are NOT stored as latitude_private /
 * longitude_private because they are not the actual property
 * coordinates.
 */
async function geocodeZip(
  zipValue?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const zip =
    zipValue?.trim() ?? "";

  if (!/^\d{5}$/.test(zip)) {
    return null;
  }

  const params =
    new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      postalcode: zip,
    });

  return geocodeWithNominatim(params);
}

/**
 * DELETE /api/projects/:id
 *
 * Removes a draft/unpublished project.
 * Published projects must be unpublished first.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  const supabase =
    createAdminClient();

  const { data: project } =
    await supabase
      .from("projects")
      .select(
        "id, publication_status"
      )
      .eq("id", params.id)
      .maybeSingle();

  if (!project) {
    return NextResponse.json({
      ok: true,
      alreadyDeleted: true,
    });
  }

  if (
    project.publication_status ===
    "published"
  ) {
    return NextResponse.json(
      {
        error:
          "Unpublish this project before deleting it",
      },
      {
        status: 400,
      }
    );
  }

  const { data: photos } =
    await supabase
      .from("photos")
      .select("storage_path")
      .eq(
        "project_id",
        params.id
      );

  const paths =
    (photos ?? [])
      .map(
        (photo) =>
          photo.storage_path
      )
      .filter(Boolean);

  if (paths.length > 0) {
    await supabase.storage
      .from("project-photos")
      .remove(paths);
  }

  await supabase
    .from("photos")
    .delete()
    .eq(
      "project_id",
      params.id
    );

  const { error } =
    await supabase
      .from("projects")
      .delete()
      .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    ok: true,
  });
}

/**
 * PATCH /api/projects/:id
 *
 * Supports:
 *
 * { action: "publish" }
 * { action: "unpublish" }
 * normal project field updates
 */
export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  const body =
    await req
      .json()
      .catch(() => ({}));

  const supabase =
    createAdminClient();

  /**
   * ========================================================
   * PUBLISH
   * ========================================================
   */
  if (body.action === "publish") {
    const {
      data: project,
      error: fetchError,
    } = await supabase
      .from("projects")
      .select("*")
      .eq("id", params.id)
      .single();

    if (
      fetchError ||
      !project
    ) {
      return NextResponse.json(
        {
          error:
            "Project not found",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * Service type must be confirmed before publication.
     */
    if (
      !project.service_type ||
      !project.service_confirmed
    ) {
      return NextResponse.json(
        {
          error:
            "Can't publish: service type isn't confirmed yet.",

          missing: [
            "service type (confirmed)",
          ],
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ======================================================
     * GENERATE MAP LOCATION
     * ======================================================
     *
     * Strategy:
     *
     * 1. Try exact private address.
     * 2. If successful:
     *      - save exact coordinates privately
     *      - jitter them for public map
     *
     * 3. If exact address fails:
     *      - geocode ZIP
     *      - jitter ZIP coordinates
     *      - do NOT save ZIP coordinates as private coords
     *
     * 4. If both fail:
     *      - stop publication with a clear error
     */

    let latPrivate:
      number | null = null;

    let lngPrivate:
      number | null = null;

    let latPublic:
      number | null = null;

    let lngPublic:
      number | null = null;

    let geocodeSource:
      | "geocoded"
      | "manual_pin" =
      "manual_pin";

    /**
     * First try the full private address.
     */
    const exactCoordinates =
      await geocodePrivateAddress(
        project
      );

    if (exactCoordinates) {
      latPrivate =
        exactCoordinates.lat;

      lngPrivate =
        exactCoordinates.lng;

      const jittered =
        jitterCoordinates(
          exactCoordinates.lat,
          exactCoordinates.lng
        );

      if (
        isValidCoordinatePair(
          jittered.lat,
          jittered.lng
        )
      ) {
        latPublic =
          jittered.lat;

        lngPublic =
          jittered.lng;

        geocodeSource =
          "geocoded";
      }
    }

    /**
     * If street-level geocoding failed,
     * fall back to the ZIP.
     */
    if (
      !isValidCoordinatePair(
        Number(latPublic),
        Number(lngPublic)
      )
    ) {
      const zipCoordinates =
        await geocodeZip(
          project.zip
        );

      if (zipCoordinates) {
        const jittered =
          jitterCoordinates(
            zipCoordinates.lat,
            zipCoordinates.lng
          );

        if (
          isValidCoordinatePair(
            jittered.lat,
            jittered.lng
          )
        ) {
          latPublic =
            jittered.lat;

          lngPublic =
            jittered.lng;

          /**
           * These are ZIP-based coordinates,
           * NOT homeowner coordinates.
           *
           * Keep private coordinate fields null.
           */
          latPrivate = null;
          lngPrivate = null;

          geocodeSource =
            "manual_pin";
        }
      }
    }

    /**
     * Never publish a project with 0,0,
     * null, NaN or otherwise invalid map coordinates.
     */
    if (
      latPublic === null ||
      lngPublic === null ||
      !isValidCoordinatePair(
        latPublic,
        lngPublic
      )
    ) {
      console.warn(
        "[project-publish] Unable to generate public map coordinates",
        {
          projectId:
            project.id,

          city:
            project.city,

          state:
            project.state,

          zip:
            project.zip,
        }
      );

      return NextResponse.json(
        {
          error:
            "Can't publish this project because its approximate map location could not be generated. Check the street address, city, state and ZIP code, then try Publish again.",

          missing: [
            "valid map location",
          ],
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ======================================================
     * SLUG
     * ======================================================
     */

    const currentSlug =
      typeof project.slug ===
      "string"
        ? project.slug
        : "";

    const finalSlug =
      !currentSlug ||
      currentSlug.startsWith(
        "draft-"
      )
        ? makeSlug(
            project.service_type,
            project.city
          )
        : currentSlug;

    /**
     * ======================================================
     * SAVE PUBLICATION
     * ======================================================
     */

    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("projects")
      .update({
        latitude_public:
          latPublic,

        longitude_public:
          lngPublic,

        latitude_private:
          latPrivate,

        longitude_private:
          lngPrivate,

        geocode_source:
          geocodeSource,

        slug:
          finalSlug,

        publication_status:
          "published",

        project_status:
          "published",

        project_description:
          stripNeedsReviewMarker(
            project.project_description
          ),
      })
      .eq(
        "id",
        params.id
      )
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      project:
        updated,

      mapLocation: {
        generated: true,

        source:
          geocodeSource,

        /**
         * Only PUBLIC approximate coordinates
         * are included in the response.
         *
         * Never return private exact coordinates.
         */
        latitude_public:
          latPublic,

        longitude_public:
          lngPublic,
      },
    });
  }

  /**
   * ========================================================
   * UNPUBLISH
   * ========================================================
   */
  if (
    body.action === "unpublish"
  ) {
    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("projects")
      .update({
        publication_status:
          "unpublished",

        project_status:
          "unpublished",
      })
      .eq(
        "id",
        params.id
      )
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      project: updated,
    });
  }

  /**
   * ========================================================
   * NORMAL PROJECT UPDATE
   * ========================================================
   */

  const allowed = [
    "customer_name",
    "customer_email",
    "customer_phone",

    "street_address_private",
    "city",
    "state",
    "zip",

    "service_type",
    "service_confirmed",
    "project_type",

    "manufacturer",
    "product",
    "product_line",
    "product_color",

    "project_description",
    "problems_discovered",
    "work_performed",
    "special_features",

    "completion_date",

    "sales_rep",
    "project_manager",
    "project_status",

    "seo_title",
    "meta_description",
    "target_keyword",
    "canonical_url",

    "page_title",
    "h1",
    "introduction",
    "project_challenge",
    "solution",
    "materials_used",
    "faq",
  ];

  const updates:
    Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      updates[key] =
        body[key];
    }
  }

  if (
    Object.keys(updates)
      .length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "No valid fields to update",
      },
      {
        status: 400,
      }
    );
  }

  /**
   * If staff manually sets the service type,
   * consider that confirmation unless the request
   * explicitly says otherwise.
   */
  if (
    "service_type" in updates
  ) {
    if (
      !(
        "service_confirmed" in
        updates
      )
    ) {
      updates.service_confirmed =
        !!updates.service_type;
    }

    if (
      !(
        "project_description" in
        updates
      )
    ) {
      const {
        data: current,
      } = await supabase
        .from("projects")
        .select(
          "project_description"
        )
        .eq(
          "id",
          params.id
        )
        .maybeSingle();

      if (current) {
        updates.project_description =
          stripNeedsReviewMarker(
            current.project_description
          );
      }
    }
  }

  const {
    data,
    error,
  } = await supabase
    .from("projects")
    .update(updates)
    .eq(
      "id",
      params.id
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    project: data,
  });
}
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeSlug } from "@/lib/slug";
import { jitterCoordinates } from "@/lib/geo";

interface Params {
  params: { id: string };
}

/**
 * PATCH /api/projects/:id
 *
 * Two modes:
 *  - normal field update: body is a partial set of project columns
 *    (service_type, manufacturer, product, completion_date, sales_rep,
 *    project_description, seo fields, story fields, etc.) — saved as-is.
 *  - { action: "publish" }: geocodes the private street address (via
 *    OpenStreetMap Nominatim — free, no API key), jitters it per
 *    SPEC.md section 4, generates the final slug, and flips
 *    publication_status to 'published'.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  if (body.action === "publish") {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let latPublic = project.latitude_public;
    let lngPublic = project.longitude_public;
    let latPrivate: number | null = null;
    let lngPrivate: number | null = null;
    let geocodeSource: "geocoded" | "manual_pin" = "manual_pin";

    // Try to geocode the real address so the public pin is a genuine jitter
    // of it rather than 0,0. Falls back to manual_pin (leaving whatever
    // coordinates are already on the row) if geocoding fails — publishing
    // should never hard-fail just because a free geocoder timed out.
    try {
      const query = encodeURIComponent(
        `${project.street_address_private}, ${project.city}, ${project.state} ${project.zip}`
      );
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
        { headers: { "User-Agent": "HertsLocalProof/1.0 (internal admin tool)" } }
      );
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        latPrivate = parseFloat(results[0].lat);
        lngPrivate = parseFloat(results[0].lon);
        const jittered = jitterCoordinates(latPrivate, lngPrivate);
        latPublic = jittered.lat;
        lngPublic = jittered.lng;
        geocodeSource = "geocoded";
      }
    } catch {
      // geocoding is best-effort — see comment above
    }

    const finalSlug = project.slug.startsWith("draft-")
      ? makeSlug(project.service_type, project.city)
      : project.slug;

    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update({
        latitude_public: latPublic,
        longitude_public: lngPublic,
        latitude_private: latPrivate,
        longitude_private: lngPrivate,
        geocode_source: geocodeSource,
        slug: finalSlug,
        publication_status: "published",
        project_status: "published",
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ project: updated });
  }

  if (body.action === "unpublish") {
    // Pulls a project back off the public site. Leaves all its data (photos,
    // coordinates, story fields) intact — just flips the status back so it
    // shows up in /admin/imports again for fixing before it goes live again.
    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update({
        publication_status: "unpublished",
        project_status: "unpublished",
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ project: updated });
  }

  // Normal partial update — only allow known columns through, never trust
  // the client to send arbitrary fields (id, timestamps, etc. stay fixed).
  const allowed = [
    "customer_name", "customer_email", "customer_phone",
    "street_address_private", "city", "state", "zip",
    "service_type", "project_type", "manufacturer", "product",
    "product_line", "product_color", "project_description",
    "problems_discovered", "work_performed", "special_features",
    "completion_date", "sales_rep", "project_manager", "project_status",
    "seo_title", "meta_description", "target_keyword", "canonical_url",
    "page_title", "h1", "introduction", "project_challenge", "solution",
    "materials_used", "faq",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}

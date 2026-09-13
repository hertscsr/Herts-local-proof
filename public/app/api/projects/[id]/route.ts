import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeSlug } from "@/lib/slug";
import { jitterCoordinates } from "@/lib/geo";
import { stripNeedsReviewMarker } from "@/lib/needs-review";

interface Params {
  params: { id: string };
}

/**
 * DELETE /api/projects/:id — removes a draft that never got published (a
 * stuck/duplicate CompanyCam import, a test project, one you decided not to
 * use). Refuses to touch anything already published — unpublish it first if
 * you really want it gone.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, publication_status")
    .eq("id", params.id)
    .maybeSingle();

  if (!project) {
    // Already gone (deleted in an earlier click, or the list the button was
    // rendered from was stale) — that's the caller's desired end state
    // either way, not an error. Returning 404 here just left dead rows
    // stuck on screen with no way to clear them.
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }
  if (project.publication_status === "published") {
    return NextResponse.json(
      { error: "Unpublish this project before deleting it" },
      { status: 400 }
    );
  }

  const { data: photos } = await supabase.from("photos").select("storage_path").eq("project_id", params.id);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from("project-photos").remove(paths);
  }
  await supabase.from("photos").delete().eq("project_id", params.id);

  const { error } = await supabase.from("projects").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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

    // Hard block: never let a project go live with a guessed/unconfirmed
    // service type. This is the single most important publish gate — a
    // wrong-but-plausible-looking service type on a live page is exactly
    // the bug that prompted this check in the first place.
    if (!project.service_type || !project.service_confirmed) {
      return NextResponse.json(
        {
          error: "Can't publish: service type isn't confirmed yet.",
          missing: ["service type (confirmed)"],
        },
        { status: 400 }
      );
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
        // Publishing means someone looked at this and confirmed the service
        // type is right — clear the "needs review" flag from auto-import so
        // it doesn't keep showing the red warning on an already-live project.
        project_description: stripNeedsReviewMarker(project.project_description),
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
    "service_type", "service_confirmed", "project_type", "manufacturer", "product",
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

  // Staff explicitly setting the service type is itself confirmation it's
  // now correct — clear the auto-import warning unless they also sent their
  // own project_description in this same request (don't clobber that), and
  // mark it confirmed unless the caller already said otherwise.
  if ("service_type" in updates) {
    if (!("service_confirmed" in updates)) {
      updates.service_confirmed = !!updates.service_type;
    }
    if (!("project_description" in updates)) {
      const { data: current } = await supabase
        .from("projects")
        .select("project_description")
        .eq("id", params.id)
        .maybeSingle();
      if (current) {
        updates.project_description = stripNeedsReviewMarker(current.project_description);
      }
    }
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

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/projects — creates a draft project so the new-project wizard
 * has a real row (and id) to attach photos/updates to as the office worker
 * moves through the steps. Draft rows never appear on the public site —
 * public_projects only selects publication_status = 'published'.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { customer_name, city, state } = body;

  if (!customer_name) {
    return NextResponse.json({ error: "customer_name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Placeholder slug/coords — replaced with real values on publish, once
  // the address is geocoded. Kept non-null here because the columns are
  // NOT NULL in the schema.
  const draftSlug = `draft-${Date.now()}`;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      customer_name,
      street_address_private: body.street_address_private ?? "",
      city: city ?? "",
      state: state ?? "",
      zip: body.zip ?? "",
      latitude_public: 0,
      longitude_public: 0,
      service_type: body.service_type ?? "roof_replacement",
      slug: draftSlug,
      publication_status: "draft",
      project_status: "new",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}

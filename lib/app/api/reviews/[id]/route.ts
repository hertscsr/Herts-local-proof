import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface Params {
  params: { id: string };
}

/**
 * PATCH /api/reviews/:id — admin-only (covered by the global admin login
 * middleware). Used to assign/reassign which job site a review belongs to,
 * approve it for the public site, and save an edited/AI-drafted reply.
 * Never posts the reply to Google itself — see reply_text's comment in
 * lib/match-review.ts / the reviews admin page for why.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if ("project_id" in body) {
    updates.project_id = body.project_id || null;
    updates.match_status = "manual";
  }
  if ("approved_for_website" in body) updates.approved_for_website = !!body.approved_for_website;
  if ("reply_text" in body) updates.reply_text = body.reply_text;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reviews")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review: data });
}

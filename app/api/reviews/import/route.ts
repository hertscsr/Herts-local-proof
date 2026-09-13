import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReviewToProject } from "@/lib/match-review";

/**
 * POST /api/reviews/import — brings Google reviews into the reviews table
 * and tries to geotag each one to a job site (see lib/match-review.ts).
 *
 * There's no built-in cron pulling from Google here — Google Business
 * Profile access for this account runs through Windsor.ai, which is a
 * connector this admin's Claude session uses, not a key this deployed app
 * holds. In practice, syncing means Claude fetches reviews from Windsor and
 * POSTs them here (on request, or on a schedule you set up) rather than
 * this route reaching out to Google on its own.
 *
 * Protected the same way the CompanyCam webhook is — a shared secret in
 * the query string, not the admin login cookie, since this is meant to be
 * called by an automated sync, not a logged-in browser.
 *
 * Body: { "reviews": [{ google_review_id, homeowner, rating, review, date,
 * reviewer_photo_url? }] }
 */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.REVIEWS_SYNC_SECRET || secret !== process.env.REVIEWS_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const reviews = body?.reviews;
  if (!Array.isArray(reviews)) {
    return NextResponse.json({ error: "body.reviews must be an array" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let imported = 0;
  let matched = 0;
  let skipped = 0;

  for (const r of reviews) {
    if (!r.google_review_id || !r.homeowner || !r.review || typeof r.rating !== "number") {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from("reviews")
      .select("id")
      .eq("google_review_id", r.google_review_id)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue; // already imported — this route is safe to re-run
    }

    const { projectId, status } = await matchReviewToProject(
      supabase,
      r.homeowner,
      r.date ?? new Date().toISOString()
    );
    const rating = Math.max(1, Math.min(5, Math.round(r.rating)));

    const { error } = await supabase.from("reviews").insert({
      project_id: projectId,
      homeowner: r.homeowner,
      rating,
      review: r.review,
      source: "google",
      google_review_id: r.google_review_id,
      reviewer_photo_url: r.reviewer_photo_url ?? null,
      match_status: status,
      date: r.date ?? new Date().toISOString().slice(0, 10),
      // 4-5 star reviews that matched a job site go straight to the public
      // site — no reason to sit on good feedback. Anything 3 stars or under,
      // or that couldn't be matched to a project, waits for a human look —
      // never auto-published, and never auto-hidden either: it still shows
      // in /admin/reviews for you to read and reply to directly.
      approved_for_website: rating >= 4 && status === "matched",
    });

    if (error) {
      skipped++;
      continue;
    }

    imported++;
    if (status === "matched") matched++;
  }

  return NextResponse.json({ ok: true, imported, matched, skipped, total: reviews.length });
}

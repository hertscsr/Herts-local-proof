import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/public/jobs — public, no auth, meant to be fetched cross-origin
 * by widget.js sitting on hertsroofingnj.com's WordPress pages. Returns
 * just enough about recent published projects to render the embeddable
 * "recent jobs" widget: no private address data, only what's already on
 * the public_projects view.
 *
 * CORS is wide open (Access-Control-Allow-Origin: *) since this is public
 * read-only data meant to be embedded anywhere, same as the RLS policy
 * already allows for anon reads of published projects/photos/reviews.
 */
export async function GET() {
  const supabase = createClient();

  const { data: projects } = await supabase
    .from("public_projects")
    .select("id, slug, city, state, service_type, manufacturer, product")
    .order("created_at", { ascending: false })
    .limit(6);

  const projectIds = (projects ?? []).map((p) => p.id);

  const [{ data: photoRows }, { data: reviewRows }] = await Promise.all([
    projectIds.length
      ? supabase
          .from("photos")
          .select("project_id, storage_path, upload_date")
          .in("project_id", projectIds)
          .order("upload_date", { ascending: true })
      : Promise.resolve({ data: [] as { project_id: string; storage_path: string }[] }),
    projectIds.length
      ? supabase
          .from("reviews")
          .select("project_id, rating, review")
          .in("project_id", projectIds)
          .eq("approved_for_website", true)
      : Promise.resolve({ data: [] as { project_id: string; rating: number; review: string }[] }),
  ]);

  const thumbnailByProject = new Map<string, string>();
  for (const p of photoRows ?? []) {
    if (!thumbnailByProject.has(p.project_id)) {
      thumbnailByProject.set(
        p.project_id,
        supabase.storage.from("project-photos").getPublicUrl(p.storage_path).data.publicUrl
      );
    }
  }

  const reviewByProject = new Map<string, { rating: number; review: string }>();
  for (const r of reviewRows ?? []) {
    if (!reviewByProject.has(r.project_id)) {
      reviewByProject.set(r.project_id, { rating: r.rating, review: r.review });
    }
  }

  const jobs = (projects ?? []).map((p) => ({
    slug: p.slug,
    city: p.city,
    state: p.state,
    serviceType: p.service_type,
    manufacturer: p.manufacturer,
    product: p.product,
    thumbnail: thumbnailByProject.get(p.id) ?? null,
    review: reviewByProject.get(p.id) ?? null,
  }));

  return NextResponse.json(
    { jobs, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "" },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

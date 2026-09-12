import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic"; // always fresh — this is an internal dashboard, not an SEO page

async function getStats() {
  const supabase = createClient();

  const [
    { count: totalProjects },
    { count: awaitingPhotos },
    { count: awaitingReview },
    { count: reviewsReceived },
    { count: publishedStories },
    { count: leadsGenerated },
  ] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("project_status", "completed"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("project_status", "review_requested"),
    supabase.from("reviews").select("*", { count: "exact", head: true }),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("publication_status", "published"),
    supabase.from("leads").select("*", { count: "exact", head: true }),
  ]);

  return {
    totalProjects: totalProjects ?? 0,
    awaitingPhotos: awaitingPhotos ?? 0,
    awaitingReview: awaitingReview ?? 0,
    reviewsReceived: reviewsReceived ?? 0,
    publishedStories: publishedStories ?? 0,
    leadsGenerated: leadsGenerated ?? 0,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const tiles = [
    { label: "Total Projects", value: stats.totalProjects },
    { label: "Awaiting Photos", value: stats.awaitingPhotos },
    { label: "Awaiting Review", value: stats.awaitingReview },
    { label: "Reviews Received", value: stats.reviewsReceived },
    { label: "Published Stories", value: stats.publishedStories },
    { label: "Leads Generated", value: stats.leadsGenerated },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Dashboard</h1>
        <a
          href="/admin/projects/new"
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + New Project
        </a>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold">{tile.value}</div>
            <div className="text-sm text-slate-500">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* TODO: top cities, top services, most viewed projects (from `events`),
          projects generating leads, avg rating, review request performance,
          and the sitemap_status indexing breakdown (see SPEC.md section 5)
          all pull from tables already in the schema — add query + chart per
          metric once the dashboard layout is finalized. */}
    </main>
  );
}

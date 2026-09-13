import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic"; // always fresh — this is an internal dashboard, not an SEO page

const WINDOW_DAYS = 30;

async function getStats() {
  // Was using the anon (RLS-scoped) client before — that silently broke
  // several of these counts, since anon can't see unpublished projects or
  // any leads/reviews at all (there's no real Supabase Auth session behind
  // this admin panel's login, so the "staff" RLS policies never matched).
  // Every other admin page uses the service-role admin client; this one
  // should too.
  const supabase = createAdminClient();

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

async function getAnalytics() {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: events }, { data: leads }, { data: projects }] = await Promise.all([
    supabase.from("events").select("event_type, project_id").gte("timestamp", since),
    supabase
      .from("leads")
      .select("id, project_id_that_generated_lead")
      .gte("date", since.slice(0, 10)),
    supabase.from("projects").select("id, customer_name, city, state, slug"),
  ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  const totals = { page_view: 0, gallery_view: 0, cta_click: 0, map_pin_click: 0 };
  const byProject = new Map<
    string,
    { page_view: number; gallery_view: number; cta_click: number; map_pin_click: number; leads: number }
  >();

  function bucket(projectId: string) {
    if (!byProject.has(projectId)) {
      byProject.set(projectId, { page_view: 0, gallery_view: 0, cta_click: 0, map_pin_click: 0, leads: 0 });
    }
    return byProject.get(projectId)!;
  }

  for (const e of events ?? []) {
    if (e.event_type in totals) {
      totals[e.event_type as keyof typeof totals]++;
    }
    if (e.project_id && e.event_type !== "lead_submit") {
      const b = bucket(e.project_id);
      if (e.event_type in b) {
        (b as unknown as Record<string, number>)[e.event_type]++;
      }
    }
  }

  let totalLeadsInWindow = 0;
  for (const lead of leads ?? []) {
    if (lead.project_id_that_generated_lead) {
      bucket(lead.project_id_that_generated_lead).leads++;
    }
    totalLeadsInWindow++;
  }

  const topProjects = Array.from(byProject.entries())
    .map(([projectId, stats]) => ({
      project: projectById.get(projectId),
      ...stats,
      conversionRate: stats.page_view > 0 ? (stats.leads / stats.page_view) * 100 : 0,
    }))
    .filter((row) => row.project)
    .sort((a, b) => b.page_view - a.page_view)
    .slice(0, 10);

  return { totals, totalLeadsInWindow, topProjects };
}

export default async function DashboardPage() {
  const [stats, analytics] = await Promise.all([getStats(), getAnalytics()]);

  const tiles = [
    { label: "Total Projects", value: stats.totalProjects, accent: "text-brand" },
    {
      label: "Awaiting Photos",
      value: stats.awaitingPhotos,
      accent: stats.awaitingPhotos > 0 ? "text-amber-600" : "text-slate-900",
    },
    {
      label: "Awaiting Review",
      value: stats.awaitingReview,
      accent: stats.awaitingReview > 0 ? "text-amber-600" : "text-slate-900",
    },
    { label: "Reviews Received", value: stats.reviewsReceived, accent: "text-slate-900" },
    { label: "Published Stories", value: stats.publishedStories, accent: "text-emerald-600" },
    { label: "Leads Generated", value: stats.leadsGenerated, accent: "text-brand-accent" },
  ];

  const overallConversion =
    analytics.totals.page_view > 0 ? (analytics.totalLeadsInWindow / analytics.totals.page_view) * 100 : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">Dashboard</h1>
        <div className="flex gap-2">
          <a
            href="/admin/imports"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review imports
          </a>
          <a
            href="/admin/projects/new"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + New Project
          </a>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className={`text-3xl font-bold ${tile.accent}`}>{tile.value}</div>
            <div className="mt-1 text-sm text-slate-500">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Last {WINDOW_DAYS} days</h2>
        <p className="mt-1 text-sm text-slate-500">
          What&apos;s actually driving calls — page views, map clicks, and estimate requests per
          project, straight from the site&apos;s own visitor tracking (not Google Analytics).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-slate-900">{analytics.totals.page_view}</div>
            <div className="mt-1 text-sm text-slate-500">Project page views</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-slate-900">{analytics.totals.map_pin_click}</div>
            <div className="mt-1 text-sm text-slate-500">Map pin clicks</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-slate-900">{analytics.totalLeadsInWindow}</div>
            <div className="mt-1 text-sm text-slate-500">Leads submitted</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-brand-accent">{overallConversion.toFixed(1)}%</div>
            <div className="mt-1 text-sm text-slate-500">View → lead rate</div>
          </div>
        </div>

        {analytics.topProjects.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Views</th>
                  <th className="py-2 pr-4">Gallery</th>
                  <th className="py-2 pr-4">Map clicks</th>
                  <th className="py-2 pr-4">CTA clicks</th>
                  <th className="py-2 pr-4">Leads</th>
                  <th className="py-2 pr-4">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topProjects.map((row) => (
                  <tr key={row.project!.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <a href={`/projects/${row.project!.slug}`} className="text-brand-accent underline">
                        {row.project!.customer_name} — {row.project!.city}, {row.project!.state}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{row.page_view}</td>
                    <td className="py-2 pr-4">{row.gallery_view}</td>
                    <td className="py-2 pr-4">{row.map_pin_click}</td>
                    <td className="py-2 pr-4">{row.cta_click}</td>
                    <td className="py-2 pr-4">{row.leads}</td>
                    <td className="py-2 pr-4">{row.conversionRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No visitor activity tracked yet in the last {WINDOW_DAYS} days.
          </p>
        )}
      </div>

      {/* TODO: top cities, top services, avg rating, review request
          performance, and the sitemap_status indexing breakdown (see
          SPEC.md section 5) still pull from tables already in the schema —
          add once needed. */}
    </main>
  );
}

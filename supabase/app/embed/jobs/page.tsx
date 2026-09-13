import { createClient } from "@/lib/supabase/server";

export const revalidate = 1800; // half-hour cache — this is meant to sit in an iframe on the main site

/**
 * Embeddable "recent jobs near you" widget — no nav, no header, sized to
 * drop into an <iframe> on hertsroofingnj.com (or anywhere else). Shows
 * recent published projects with their approved review, if any, so a
 * visitor sees real, geotagged social proof without leaving the main site.
 *
 * To embed: <iframe src="https://<your-vercel-domain>/embed/jobs"
 * style="width:100%;border:0" height="600"></iframe> — adjust height to
 * taste, or ask about a resize script if the fixed height ever clips content.
 */
export default async function JobsWidget() {
  const supabase = createClient();

  const { data: projects } = await supabase
    .from("public_projects")
    .select("id, slug, city, state, service_type, manufacturer, product")
    .order("created_at", { ascending: false })
    .limit(6);

  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: reviews } = projectIds.length
    ? await supabase
        .from("reviews")
        .select("project_id, homeowner, rating, review")
        .in("project_id", projectIds)
        .eq("approved_for_website", true)
    : { data: [] };

  const reviewByProject = new Map((reviews ?? []).map((r) => [r.project_id, r]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "12px", color: "#0f172a" }}>
      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {(projects ?? []).map((p) => {
          const review = reviewByProject.get(p.id);
          return (
            <a
              key={p.id}
              href={`${siteUrl}/projects/${p.slug}`}
              target="_top"
              style={{
                display: "block",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "12px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", color: "#c2410c" }}>
                {p.service_type?.replace(/_/g, " ")}
              </div>
              <div style={{ marginTop: "4px", fontWeight: 500 }}>
                {p.city}, {p.state}
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#475569" }}>
                {p.manufacturer} {p.product}
              </div>
              {review && (
                <div style={{ marginTop: "8px", fontSize: "13px", color: "#334155" }}>
                  <span style={{ color: "#f59e0b" }}>{"★".repeat(review.rating)}</span>
                  {" “"}
                  {review.review.length > 90 ? `${review.review.slice(0, 90)}…` : review.review}
                  {"”"}
                </div>
              )}
            </a>
          );
        })}
      </div>

      {(!projects || projects.length === 0) && (
        <p style={{ color: "#64748b", fontSize: "14px" }}>No published jobs yet.</p>
      )}
    </div>
  );
}

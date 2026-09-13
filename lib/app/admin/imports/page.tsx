import { createAdminClient } from "@/lib/supabase/admin";
import PublishButton from "./publish-button";
import UnpublishButton from "./unpublish-button";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name, city, state, service_type, publication_status, companycam_project_id, project_description")
    .not("companycam_project_id", "is", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">Imported from CompanyCam</h1>
      <p className="mt-2 text-sm text-slate-600">
        Projects pulled in automatically when tagged &quot;Hertsworks&quot; in
        CompanyCam. Review the service type and description, then publish —
        nothing here is live on the public site until you do.
      </p>

      <div className="mt-6 space-y-4">
        {(projects ?? []).map((p) => (
          <div key={p.id} className="rounded border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{p.customer_name}</div>
                <div className="text-sm text-slate-500">
                  {p.city}, {p.state} — {p.service_type?.replace(/_/g, " ")}
                </div>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  p.publication_status === "published"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {p.publication_status}
              </span>
            </div>
            {p.project_description?.includes("NEEDS REVIEW") && (
              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                Service type couldn&apos;t be matched from CompanyCam labels — verify it&apos;s correct before publishing.
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href={`/admin/imports/${p.id}`}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Edit content
              </a>
              {p.publication_status !== "published" && <PublishButton projectId={p.id} />}
              {p.publication_status === "published" && <UnpublishButton projectId={p.id} />}
            </div>
          </div>
        ))}

        {(!projects || projects.length === 0) && (
          <p className="text-sm text-slate-500">
            Nothing imported yet. Tag a completed job &quot;Hertsworks&quot; in
            CompanyCam to see it show up here.
          </p>
        )}
      </div>
    </main>
  );
}

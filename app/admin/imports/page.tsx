import { createAdminClient } from "@/lib/supabase/admin";
import { hasNeedsReviewFlag } from "@/lib/needs-review";
import PublishButton from "./publish-button";
import UnpublishButton from "./unpublish-button";
import DeleteButton from "./delete-button";

export const dynamic = "force-dynamic";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name, city, state, service_type, publication_status, companycam_project_id, project_description, created_at")
    .not("companycam_project_id", "is", null)
    .order("created_at", { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id);

  // One thumbnail + a real photo count per project, so a failed/partial
  // photo import (the #1 support headache) is obvious at a glance instead
  // of something you find out by opening every project one at a time.
  const { data: photoRows } = projectIds.length
    ? await supabase
        .from("photos")
        .select("project_id, storage_path, upload_date")
        .in("project_id", projectIds)
        .order("upload_date", { ascending: true })
    : { data: [] };

  const thumbnailByProject = new Map<string, string>();
  const photoCountByProject = new Map<string, number>();
  for (const photo of photoRows ?? []) {
    photoCountByProject.set(photo.project_id, (photoCountByProject.get(photo.project_id) ?? 0) + 1);
    if (!thumbnailByProject.has(photo.project_id)) {
      thumbnailByProject.set(
        photo.project_id,
        supabase.storage.from("project-photos").getPublicUrl(photo.storage_path).data.publicUrl
      );
    }
  }

  const needsAttention = (projects ?? []).filter(
    (p) => hasNeedsReviewFlag(p.project_description) || (photoCountByProject.get(p.id) ?? 0) === 0
  ).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Imported from CompanyCam</h1>
          <p className="mt-2 text-sm text-slate-600">
            Projects pulled in automatically when tagged &quot;Hertsworks&quot; in CompanyCam. Review
            the service type and photos, then publish — nothing here is live on the public site until
            you do.
          </p>
        </div>
        <a
          href="/admin/companycam-import"
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Manually pull in a job
        </a>
      </div>

      {searchParams.saved === "1" && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. Changes are reflected below.
        </div>
      )}

      {needsAttention > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{needsAttention}</strong> project{needsAttention === 1 ? "" : "s"} below{" "}
          {needsAttention === 1 ? "needs" : "need"} a quick check — missing photos or an unconfirmed
          service type.
        </div>
      )}

      <div className="mt-6 space-y-4">
        {(projects ?? []).map((p) => {
          const photoCount = photoCountByProject.get(p.id) ?? 0;
          const thumbnail = thumbnailByProject.get(p.id);
          const needsReview = hasNeedsReviewFlag(p.project_description);
          const published = p.publication_status === "published";

          return (
            <div
              key={p.id}
              className="flex gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-center text-[11px] leading-tight text-slate-400">
                    No photo
                    <br />
                    yet
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{p.customer_name}</div>
                    <div className="text-sm text-slate-500">
                      {p.city}, {p.state} — {p.service_type?.replace(/_/g, " ")}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      published ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {published ? "Published" : "Draft"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      photoCount === 0
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {photoCount === 0 ? "0 photos — check CompanyCam" : `${photoCount} photo${photoCount === 1 ? "" : "s"}`}
                  </span>
                  {needsReview && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Service type unconfirmed
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/imports/${p.id}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Edit content
                  </a>
                  {!published && <PublishButton projectId={p.id} />}
                  {published && <UnpublishButton projectId={p.id} />}
                  {!published && <DeleteButton projectId={p.id} label={p.customer_name} />}
                </div>
              </div>
            </div>
          );
        })}

        {(!projects || projects.length === 0) && (
          <p className="text-sm text-slate-500">
            Nothing imported yet. Tag a completed job &quot;Hertsworks&quot; in CompanyCam to see it
            show up here.
          </p>
        )}
      </div>
    </main>
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import ManualImportClient from "./manual-import-client";

export const dynamic = "force-dynamic";

export default async function CompanyCamImportPage() {
  const supabase = createAdminClient();
  const { data: draftProjects } = await supabase
    .from("projects")
    .select("id, customer_name, city, state")
    .neq("publication_status", "published")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">Manually Pull In a Job</h1>
      <p className="mt-2 text-sm text-slate-600">
        Search for a job in CompanyCam, pick exactly which photos to bring over, and either start a
        new draft from it or add them onto an existing one already in your imports list. Use this
        whenever the automatic &quot;Hertsworks&quot; import missed a job, got the wrong service
        type, or only caught some of the photos.
      </p>

      <ManualImportClient draftProjects={draftProjects ?? []} />
    </main>
  );
}

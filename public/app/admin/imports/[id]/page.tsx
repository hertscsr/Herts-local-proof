import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import EditProjectForm from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditImportedProjectPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!project) notFound();

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, phase")
    .eq("project_id", params.id)
    .order("upload_date", { ascending: true });

  const photoUrls = (photos ?? []).map((p) => ({
    id: p.id,
    phase: p.phase,
    url: supabase.storage.from("project-photos").getPublicUrl(p.storage_path).data.publicUrl,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">
        {project.customer_name} — {project.city}, {project.state}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {photoUrls.length} photo{photoUrls.length === 1 ? "" : "s"} imported. Write or generate the
        page content below, then save. Nothing here goes live until you publish it from the imports list.
      </p>

      {photoUrls.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photoUrls.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={p.url}
              alt={p.phase}
              className="h-24 w-full rounded object-cover"
            />
          ))}
        </div>
      )}

      <EditProjectForm project={project} />
    </main>
  );
}

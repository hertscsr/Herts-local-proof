import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface Params {
  params: { id: string };
}

/**
 * POST /api/projects/:id/photos — accepts a multipart form with a `file`,
 * `phase` (before/during/after), and optional `caption`. Uploads to the
 * `project-photos` Supabase Storage bucket and records a row in `photos`.
 *
 * Requires a public Storage bucket named "project-photos" to exist —
 * create it once in the Supabase dashboard (Storage → New bucket → name it
 * exactly "project-photos" → Public bucket: on). Not something SQL creates.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const phase = formData.get("phase") as string | null;
  const caption = (formData.get("caption") as string | null) ?? null;

  if (!file || !phase) {
    return NextResponse.json({ error: "file and phase are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("city, service_type")
    .eq("id", params.id)
    .single();

  const ext = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const path = `${params.id}/${phase}-${timestamp}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("project-photos")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const altTextAuto = project
    ? `${project.service_type?.replace(/_/g, " ")} in ${project.city} — ${phase} photo`
    : null;

  const { data: photo, error: insertError } = await supabase
    .from("photos")
    .insert({
      project_id: params.id,
      phase,
      storage_path: path,
      caption,
      alt_text_auto: altTextAuto,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: publicUrl } = supabase.storage.from("project-photos").getPublicUrl(path);

  return NextResponse.json({ photo, url: publicUrl.publicUrl });
}

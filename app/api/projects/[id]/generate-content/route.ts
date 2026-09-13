import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateProjectContent } from "@/lib/generate-content";
import type { Project } from "@/types/database";

interface Params {
  params: { id: string };
}

/**
 * POST /api/projects/:id/generate-content — drafts introduction/challenge/
 * solution/materials/FAQ with Claude from the project's existing fields.
 * Returns the draft; does NOT save it. The admin editor screen shows it in
 * the form fields for review/editing, and only the "Save" button actually
 * writes it to the database via the normal PATCH route.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const content = await generateProjectContent(project as Project);
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 }
    );
  }
}

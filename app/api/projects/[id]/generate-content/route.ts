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
 *
 * Accepts an optional { overrides: {...} } body of fields the admin has
 * changed on screen but not saved yet (service type, city, state) — without
 * this, generating right after changing the service type dropdown (but
 * before clicking Save) would silently draft content for the OLD saved
 * service type instead of the one currently selected.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const overrides = body?.overrides ?? {};
  const allowedOverrides = ["service_type", "city", "state", "manufacturer", "product", "product_line", "product_color", "project_description"];
  const merged = { ...project };
  for (const key of allowedOverrides) {
    if (key in overrides && overrides[key]) merged[key] = overrides[key];
  }

  if (!merged.service_type) {
    return NextResponse.json(
      { error: "Pick a service type before generating — otherwise there's nothing to write about." },
      { status: 400 }
    );
  }

  try {
    const content = await generateProjectContent(merged as Project);
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateProjectContent } from "@/lib/generate-content";
import type { Project, ServiceType } from "@/types/database";

interface Params {
  params: { id: string };
}

interface GenerateRequestBody {
  service_type?: ServiceType | "";
  customer_name?: string;
  city?: string;
  state?: string;
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  let body: GenerateRequestBody = {};

  try {
    body = await req.json();
  } catch {
    // Empty request body is allowed.
  }

  const generationProject: Project = {
    ...(project as Project),

    service_type:
      body.service_type !== undefined && body.service_type !== ""
        ? body.service_type
        : project.service_type,

    customer_name:
      body.customer_name !== undefined
        ? body.customer_name
        : project.customer_name,

    city:
      body.city !== undefined
        ? body.city
        : project.city,

    state:
      body.state !== undefined
        ? body.state
        : project.state,
  };

  if (!generationProject.service_type) {
    return NextResponse.json(
      {
        error: "Select a service type before generating content.",
      },
      { status: 400 }
    );
  }

  try {
    const content = await generateProjectContent(generationProject);

    return NextResponse.json({
      content,
      service_type_used: generationProject.service_type,
    });
  } catch (e) {
    console.error("Project content generation failed", {
      projectId: params.id,
      serviceType: generationProject.service_type,
      error: e instanceof Error ? e.message : String(e),
    });

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Generation failed",
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { listCompanyCamPhotos } from "@/lib/companycam";

/**
 * GET /api/companycam/cc-photos?projectId=... — admin-only. Lists every
 * photo currently on a CompanyCam project, for the manual mapping tool's
 * photo-picker grid.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing ?projectId=" }, { status: 400 });
  }

  try {
    const photos = await listCompanyCamPhotos(projectId);
    return NextResponse.json({ photos });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CompanyCam photo fetch failed" },
      { status: 500 }
    );
  }
}

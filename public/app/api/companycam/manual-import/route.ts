import { NextRequest, NextResponse } from "next/server";
import { manualImportCompanyCamPhotos } from "@/lib/import-companycam";

/**
 * POST /api/companycam/manual-import — admin-only. Staff-driven alternative
 * to the automatic "Hertsworks" webhook: pick a specific CompanyCam project,
 * pick specific photos, and either create a new draft from them or add them
 * onto an existing project. Body: { ccProjectId, photoIds: string[],
 * targetProjectId?: string }.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.ccProjectId || !Array.isArray(body?.photoIds) || body.photoIds.length === 0) {
    return NextResponse.json({ error: "ccProjectId and at least one photoId are required" }, { status: 400 });
  }

  try {
    const result = await manualImportCompanyCamPhotos({
      ccProjectId: body.ccProjectId,
      photoIds: body.photoIds,
      targetProjectId: body.targetProjectId || null,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Manual import failed" },
      { status: 500 }
    );
  }
}

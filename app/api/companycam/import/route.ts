import { NextRequest, NextResponse } from "next/server";
import { importCompanyCamProject } from "@/lib/import-companycam";

/**
 * POST /api/companycam/import — manual trigger, same logic the webhook
 * uses. Exists so you can test/import a specific CompanyCam project without
 * waiting on a real webhook delivery (useful the first time, since the
 * exact webhook payload shape gets confirmed only once a real one fires —
 * check Vercel's function logs on the webhook route if automatic imports
 * aren't showing up, and this route still works as a manual fallback).
 *
 * Body: { "companycam_project_id": "114383140" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.companycam_project_id) {
    return NextResponse.json({ error: "companycam_project_id is required" }, { status: 400 });
  }

  try {
    const result = await importCompanyCamProject(body.companycam_project_id);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "import failed" },
      { status: 500 }
    );
  }
}

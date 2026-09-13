import { NextRequest, NextResponse } from "next/server";
import { resyncServiceTypeFromCompanyCam } from "@/lib/import-companycam";

interface Params {
  params: { id: string };
}

/**
 * POST /api/projects/:id/resync-service-type — admin-only. Re-reads this
 * project's CompanyCam labels right now and updates the service type if a
 * label matches. Use when a job's service type looks wrong/unconfirmed but
 * you've since fixed or added the right label in CompanyCam.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const result = await resyncServiceTypeFromCompanyCam(params.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Re-check failed" },
      { status: 500 }
    );
  }
}

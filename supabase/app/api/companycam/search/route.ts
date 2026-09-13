import { NextRequest, NextResponse } from "next/server";
import { listCompanyCamProjects } from "@/lib/companycam";

/**
 * GET /api/companycam/search?q=... — admin-only. Looks up CompanyCam
 * projects by name/address for the manual mapping tool
 * (/admin/companycam-import), so staff can find a job that the automatic
 * "Hertsworks" webhook missed or mismatched and pull it in by hand.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  }

  try {
    const projects = await listCompanyCamProjects(q);
    return NextResponse.json({ projects });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CompanyCam search failed" },
      { status: 500 }
    );
  }
}

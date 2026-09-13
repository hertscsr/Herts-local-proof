import { NextRequest, NextResponse } from "next/server";
import { clearAllImports } from "@/lib/import-companycam";

/**
 * POST /api/admin/clear-imports — admin-only, destructive. Deletes every
 * CompanyCam-imported project (published or not) and its photo files, for
 * starting the imports list over from scratch. Requires the literal body
 * {"confirm": "DELETE ALL"} so this can never fire from a stray click or a
 * retried request — the UI button is the only thing that sends it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE ALL") {
    return NextResponse.json({ error: "Confirmation missing" }, { status: 400 });
  }

  try {
    const result = await clearAllImports();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clear failed" },
      { status: 500 }
    );
  }
}

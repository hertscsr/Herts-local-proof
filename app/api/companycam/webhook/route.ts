import { NextRequest, NextResponse } from "next/server";
import { importCompanyCamProject } from "@/lib/import-companycam";

/**
 * Receives CompanyCam webhook events. Subscribed to project label events —
 * when a project gets tagged "Hertsworks" in CompanyCam, this pulls it into
 * Supabase as a draft LocalProof project (see lib/import-companycam.ts for
 * the label → service_type mapping and photo import logic). "Hertsworks" is
 * a dedicated trigger label — it doesn't need to mean anything else, it's
 * just the on-switch for "send this to the website." Tag the project with
 * its service label (e.g. "Roof replacement") too, so the import knows
 * which service_type to use.
 *
 * Protected by a shared secret in the URL query string rather than
 * signature verification, since CompanyCam's exact signing header wasn't
 * confirmed at build time — this route's URL should be treated as a
 * credential (don't post it publicly) and rotated via COMPANYCAM_WEBHOOK_SECRET
 * if it ever leaks.
 */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.COMPANYCAM_WEBHOOK_SECRET || secret !== process.env.COMPANYCAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true }); // ignore malformed pings

  // CompanyCam's payload shape for label events carries the project id and
  // the label that triggered it — adjust the field paths here if a real
  // delivery looks different once this is live (check Vercel's function logs).
  const projectId: string | undefined =
    body.project_id ?? body.data?.project_id ?? body.data?.id;
  const labelValue: string =
    (body.label?.display_value ?? body.data?.label?.display_value ?? "").toLowerCase();

  if (!projectId) {
    return NextResponse.json({ ok: true, skipped: "no project_id in payload" });
  }

  // Only import when the "Hertsworks" label is the one that was just added —
  // avoids re-importing on every unrelated label/tag change.
  if (labelValue && labelValue !== "hertsworks") {
    return NextResponse.json({ ok: true, skipped: `label "${labelValue}" is not "Hertsworks"` });
  }

  try {
    const result = await importCompanyCamProject(projectId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("CompanyCam import failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "import failed" },
      { status: 500 }
    );
  }
}

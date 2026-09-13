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

  // Log every delivery so real payload shapes are visible in Vercel's
  // function logs if CompanyCam ever changes something here.
  console.log("CompanyCam webhook payload", JSON.stringify(body));

  // CompanyCam's real envelope (per their docs): { event_type, created_at,
  // payload, webhook_id } — payload is the full Project object, matching
  // what the CompanyCam API itself returns (id, labels: [...], etc.).
  const project = body.payload ?? body.data ?? body;
  const projectId: string | undefined = project?.id;
  const labels: string[] = (project?.labels ?? []).map(
    (l: any) => (l.display_value ?? l.value ?? "").toLowerCase()
  );

  if (!projectId) {
    return NextResponse.json({ ok: true, skipped: "no project id in payload" });
  }

  // Only import when "Hertsworks" is one of the project's current labels —
  // that's the dedicated on-switch. Ignores unrelated label/tag changes.
  if (!labels.includes("hertsworks")) {
    return NextResponse.json({ ok: true, skipped: `no "Hertsworks" label on this project (has: ${labels.join(", ") || "none"})` });
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

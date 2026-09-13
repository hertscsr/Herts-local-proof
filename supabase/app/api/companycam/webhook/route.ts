import { NextRequest, NextResponse } from "next/server";
import { importCompanyCamProject, removeDraftOnLabelRemoved } from "@/lib/import-companycam";

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

  // Confirmed real envelope from a live delivery (Vercel logs):
  // { event_type: "project.label_added", created_at, payload: { project: {...}, label: {...} }, webhook_id }
  // — project id is nested under payload.project.id, and the label that was
  // just added is a single object at payload.label, not an array.
  const projectId: string | undefined = body.payload?.project?.id;
  const label = body.payload?.label;
  const labelValue: string = (label?.display_value ?? label?.value ?? "").toLowerCase();

  if (!projectId) {
    return NextResponse.json({ ok: true, skipped: "no project id in payload" });
  }

  // Taking the "Hertsworks" label back off cleans up a draft that was never
  // published — stops the imports list from filling up with jobs you
  // decided not to send to the website after all. Published projects are
  // left untouched (see removeDraftOnLabelRemoved).
  if (body.event_type === "project.label_removed" && labelValue === "hertsworks") {
    try {
      const result = await removeDraftOnLabelRemoved(projectId);
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      console.error("CompanyCam draft cleanup failed", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "cleanup failed" },
        { status: 500 }
      );
    }
  }

  // Only import when the label that was just added is "Hertsworks" —
  // that's the dedicated on-switch. Ignores unrelated label/tag changes.
  if (labelValue !== "hertsworks") {
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

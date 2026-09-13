import { NextRequest, NextResponse } from "next/server";
import {
  importCompanyCamProject,
  removeDraftOnLabelRemoved,
} from "@/lib/import-companycam";
import {
  companyCamLog,
  getErrorMessage,
} from "@/lib/companycam-logger";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  /*
   * ---------------------------------------------------------
   * AUTHENTICATION
   * ---------------------------------------------------------
   */
  const secret = req.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.COMPANYCAM_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    companyCamLog.warn("webhook.unauthorized", {
      requestId,
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: "unauthorized",
      },
      { status: 401 }
    );
  }

  /*
   * ---------------------------------------------------------
   * PARSE BODY
   * ---------------------------------------------------------
   */
  let body: any;

  try {
    body = await req.json();
  } catch (error) {
    companyCamLog.warn("webhook.invalid_json", {
      requestId,
      error: getErrorMessage(error),
    });

    // CompanyCam may occasionally send a malformed/test ping.
    return NextResponse.json({
      ok: true,
      requestId,
      skipped: true,
      reason: "invalid JSON payload",
    });
  }

  const eventType: string | undefined = body?.event_type;
  const project = body?.payload?.project;
  const label = body?.payload?.label;

  const projectId: string | undefined = project?.id;

  const labelValue = String(
    label?.display_value ?? label?.value ?? ""
  )
    .trim()
    .toLowerCase();

  /*
   * ---------------------------------------------------------
   * CLEAN WEBHOOK LOG
   * ---------------------------------------------------------
   *
   * Do NOT dump the entire CompanyCam payload into Vercel.
   */
  companyCamLog.info("webhook.received", {
    requestId,
    eventType,
    webhookId: body?.webhook_id ?? null,

    projectId: projectId ?? null,
    projectName: project?.name ?? null,

    label: label?.display_value ?? label?.value ?? null,

    companyCamPhotoCount: project?.photo_count ?? null,

    city: project?.address?.city ?? null,
    state: project?.address?.state ?? null,
  });

  /*
   * Optional full payload debugging.
   *
   * Keep COMPANYCAM_DEBUG=false in production normally.
   */
  if (process.env.COMPANYCAM_DEBUG === "true") {
    companyCamLog.info("webhook.debug_payload", {
      requestId,
      payload: body,
    });
  }

  /*
   * ---------------------------------------------------------
   * PROJECT ID VALIDATION
   * ---------------------------------------------------------
   */
  if (!projectId) {
    companyCamLog.warn("webhook.skipped", {
      requestId,
      reason: "missing_project_id",
      eventType,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      skipped: true,
      reason: "no project id in payload",
    });
  }

  /*
   * ---------------------------------------------------------
   * HERTSWORKS REMOVED
   * ---------------------------------------------------------
   */
  if (
    eventType === "project.label_removed" &&
    labelValue === "hertsworks"
  ) {
    companyCamLog.info("draft_cleanup.started", {
      requestId,
      projectId,
    });

    try {
      const result = await removeDraftOnLabelRemoved(projectId);

      companyCamLog.info("draft_cleanup.complete", {
        requestId,
        projectId,
        ...result,
      });

      return NextResponse.json({
        ok: true,
        requestId,
        action: "draft_cleanup",
        result,
      });
    } catch (error) {
      companyCamLog.error("draft_cleanup.failed", {
        requestId,
        projectId,
        error: getErrorMessage(error),
      });

      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: getErrorMessage(error),
        },
        { status: 500 }
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * ONLY HERTSWORKS TRIGGERS IMPORT
   * ---------------------------------------------------------
   */
  if (
    eventType !== "project.label_added" ||
    labelValue !== "hertsworks"
  ) {
    companyCamLog.info("webhook.skipped", {
      requestId,
      projectId,
      eventType,
      label: labelValue || null,
      reason: "not_hertsworks_trigger",
    });

    return NextResponse.json({
      ok: true,
      requestId,
      skipped: true,
      reason: "event does not trigger LocalProof import",
    });
  }

  /*
   * ---------------------------------------------------------
   * IMPORT
   * ---------------------------------------------------------
   */
  companyCamLog.info("import.started", {
    requestId,
    projectId,
    projectName: project?.name ?? null,
    expectedPhotos: project?.photo_count ?? null,
  });

  try {
    const result = await importCompanyCamProject(
      projectId,
      requestId
    );

    companyCamLog.info("import.complete", {
      requestId,
      companyCamProjectId: projectId,
      localProjectId: result.projectId,

      status: result.status,

      serviceType: result.serviceType,
      serviceMatched: result.matched,

      photosFound: result.totalPhotos,
      photosImported: result.importedCount,
      photosAlreadyImported: result.alreadyImportedCount,
      photosFailed: result.failedCount,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      result,
    });
  } catch (error) {
    companyCamLog.error("import.failed", {
      requestId,
      projectId,
      error: getErrorMessage(error),
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        projectId,
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { manualImportCompanyCamPhotos } from "@/lib/import-companycam";
import { MAX_LOCALPROOF_PHOTOS } from "@/lib/companycam";

/**
 * POST /api/companycam/manual-import
 *
 * Admin-only manual CompanyCam import.
 *
 * Staff can:
 * - Select a CompanyCam project
 * - Select up to 5 photos
 * - Create a new LocalProof draft
 * - Or add the photos to an existing draft
 *
 * The photo limit is enforced here on the server so it cannot be
 * bypassed by the browser UI.
 */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    !("ccProjectId" in body) ||
    !("photoIds" in body)
  ) {
    return NextResponse.json(
      {
        error: "ccProjectId and at least one photoId are required",
      },
      { status: 400 }
    );
  }

  const rawBody = body as {
    ccProjectId?: unknown;
    photoIds?: unknown;
    targetProjectId?: unknown;
  };

  if (
    !rawBody.ccProjectId ||
    !Array.isArray(rawBody.photoIds) ||
    rawBody.photoIds.length === 0
  ) {
    return NextResponse.json(
      {
        error: "ccProjectId and at least one photoId are required",
      },
      { status: 400 }
    );
  }

  const photoIds: string[] = [
    ...new Set<string>(
      rawBody.photoIds.map((photoId: unknown) => String(photoId))
    ),
  ];

  if (photoIds.length > MAX_LOCALPROOF_PHOTOS) {
    return NextResponse.json(
      {
        error: `LocalProof allows a maximum of ${MAX_LOCALPROOF_PHOTOS} photos per manual import.`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await manualImportCompanyCamPhotos({
      ccProjectId: String(rawBody.ccProjectId),
      photoIds,
      targetProjectId: rawBody.targetProjectId
        ? String(rawBody.targetProjectId)
        : null,
    });

    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Manual import failed",
      },
      { status: 500 }
    );
  }
}
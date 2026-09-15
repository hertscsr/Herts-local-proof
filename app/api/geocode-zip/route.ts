import { NextRequest, NextResponse } from "next/server";

/*
 * ---------------------------------------------------------
 * HERTS LOCALPROOF — PUBLIC ZIP GEOCODER
 * ---------------------------------------------------------
 *
 * Purpose:
 * Convert a visitor-entered U.S. ZIP code into approximate
 * coordinates for the "Projects Near Me" search.
 *
 * This route:
 * - Accepts only valid 5-digit U.S. ZIP codes
 * - Restricts Nominatim searches to the United States
 * - Validates returned coordinates
 * - Rejects 0,0
 * - Uses a timeout
 * - Handles bad HTTP responses safely
 * - Does NOT save anything to Supabase
 * - Does NOT geocode homeowner street addresses
 */

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const REQUEST_TIMEOUT_MS = 8000;

/*
 * Validate a standard 5-digit U.S. ZIP code.
 *
 * Example:
 * 07016
 * 17985
 */
function isValidUSZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

/*
 * Validate coordinates before they are returned to the browser.
 */
function isValidCoordinatePair(
  lat: number,
  lng: number
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  // Never accept our placeholder / Null Island.
  if (lat === 0 && lng === 0) {
    return false;
  }

  if (lat < -90 || lat > 90) {
    return false;
  }

  if (lng < -180 || lng > 180) {
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  /*
   * -------------------------------------------------------
   * READ ZIP
   * -------------------------------------------------------
   */

  const rawZip =
    req.nextUrl.searchParams.get("zip");

  const zip = rawZip?.trim() ?? "";

  if (!zip) {
    return NextResponse.json(
      {
        error: "ZIP code is required.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * Do not send arbitrary text to the external geocoder.
   */
  if (!isValidUSZip(zip)) {
    return NextResponse.json(
      {
        error:
          "Please enter a valid 5-digit U.S. ZIP code.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * -------------------------------------------------------
   * BUILD GEOCODER REQUEST
   * -------------------------------------------------------
   */

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
    postalcode: zip,
  });

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    /*
     * -----------------------------------------------------
     * CALL NOMINATIM
     * -----------------------------------------------------
     */

    const response = await fetch(
      `${NOMINATIM_URL}?${params.toString()}`,
      {
        method: "GET",

        headers: {
          "User-Agent":
            "HertsLocalProof/1.0 (near-me ZIP search)",
          Accept: "application/json",
        },

        signal: controller.signal,

        /*
         * Avoid keeping stale geocoder responses forever.
         */
        next: {
          revalidate: 86400,
        },
      }
    );

    /*
     * -----------------------------------------------------
     * HTTP VALIDATION
     * -----------------------------------------------------
     */

    if (!response.ok) {
      console.warn(
        "[geocode-zip] Nominatim request failed",
        {
          zip,
          status: response.status,
        }
      );

      return NextResponse.json(
        {
          error:
            "ZIP lookup is temporarily unavailable.",
        },
        {
          status: 502,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * PARSE RESPONSE
     * -----------------------------------------------------
     */

    const results: unknown =
      await response.json();

    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Couldn't find that ZIP code.",
        },
        {
          status: 404,
        }
      );
    }

    const result = results[0];

    if (
      !result ||
      typeof result !== "object"
    ) {
      return NextResponse.json(
        {
          error:
            "ZIP lookup returned an invalid result.",
        },
        {
          status: 502,
        }
      );
    }

    const record = result as {
      lat?: string;
      lon?: string;
      display_name?: string;
    };

    const lat = Number.parseFloat(
      record.lat ?? ""
    );

    const lng = Number.parseFloat(
      record.lon ?? ""
    );

    /*
     * -----------------------------------------------------
     * COORDINATE SAFETY
     * -----------------------------------------------------
     */

    if (
      !isValidCoordinatePair(
        lat,
        lng
      )
    ) {
      console.warn(
        "[geocode-zip] Invalid coordinates returned",
        {
          zip,
          lat,
          lng,
        }
      );

      return NextResponse.json(
        {
          error:
            "ZIP lookup returned invalid coordinates.",
        },
        {
          status: 502,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * SUCCESS
     * -----------------------------------------------------
     *
     * ZIP-level coordinates are approximate by nature.
     * They do not represent a homeowner's street address.
     */

    return NextResponse.json(
      {
        ok: true,
        zip,
        lat,
        lng,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=86400",
        },
      }
    );
  } catch (error) {
    /*
     * -----------------------------------------------------
     * ERROR HANDLING
     * -----------------------------------------------------
     */

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      console.warn(
        "[geocode-zip] Request timed out",
        {
          zip,
        }
      );

      return NextResponse.json(
        {
          error:
            "ZIP lookup timed out. Please try again.",
        },
        {
          status: 504,
        }
      );
    }

    console.error(
      "[geocode-zip] Unexpected error",
      {
        zip,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );

    return NextResponse.json(
      {
        error:
          "ZIP lookup is temporarily unavailable.",
      },
      {
        status: 500,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
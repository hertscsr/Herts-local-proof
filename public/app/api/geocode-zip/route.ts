import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode-zip?zip=07016 — public, no auth needed (same free
 * Nominatim geocoder the publish flow already uses, just for a ZIP instead
 * of a street address). Used by the /near-me ZIP search box so a visitor's
 * ZIP gets turned into real coordinates for distance sorting, not just an
 * exact-match filter against a job's own ZIP.
 */
export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip")?.trim();
  if (!zip) {
    return NextResponse.json({ error: "zip is required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&postalcode=${encodeURIComponent(zip)}`,
      { headers: { "User-Agent": "HertsLocalProof/1.0 (internal near-me search)" } }
    );
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      return NextResponse.json({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
    }
  } catch {
    // fall through to the not-found response below
  }

  return NextResponse.json({ error: "Couldn't find that ZIP code" }, { status: 404 });
}

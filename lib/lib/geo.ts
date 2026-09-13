/**
 * Address-jittering helper. See SPEC.md section 4.
 *
 * Takes the real geocoded lat/lng (never exposed publicly) and returns an
 * offset "public" pin 0.25–0.6 miles away in a random direction, so the
 * public map never reveals the true property location.
 */
export function jitterCoordinates(
  lat: number,
  lng: number,
  minMiles = 0.25,
  maxMiles = 0.6
): { lat: number; lng: number } {
  const milesToDegreesLat = 1 / 69; // ~69 miles per degree latitude
  const milesToDegreesLng = 1 / (69 * Math.cos((lat * Math.PI) / 180));

  const distance = minMiles + Math.random() * (maxMiles - minMiles);
  const angle = Math.random() * 2 * Math.PI;

  const latOffset = distance * Math.cos(angle) * milesToDegreesLat;
  const lngOffset = distance * Math.sin(angle) * milesToDegreesLng;

  return {
    lat: lat + latOffset,
    lng: lng + lngOffset,
  };
}

/** Haversine distance in miles, used for "X.X miles away" on near-me cards. */
export function distanceInMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

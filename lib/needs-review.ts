const NEEDS_REVIEW_PREFIX = /^\[SERVICE TYPE NEEDS REVIEW[^\]]*\]\n\n/;

/** True if this project's description still carries the auto-import warning. */
export function hasNeedsReviewFlag(description: string | null | undefined): boolean {
  return !!description && description.includes("NEEDS REVIEW");
}

/**
 * Strips the "[SERVICE TYPE NEEDS REVIEW...]" marker that import-companycam.ts
 * prepends when it can't match a CompanyCam label to a service type. Call this
 * whenever staff have effectively confirmed the service type — by publishing,
 * or by editing it directly — so the warning doesn't follow the project
 * around forever once it's actually been looked at.
 */
export function stripNeedsReviewMarker(description: string | null | undefined): string | null {
  if (!description) return description ?? null;
  return description.replace(NEEDS_REVIEW_PREFIX, "");
}

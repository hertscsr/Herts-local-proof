/** Turns "Roof Replacement" + "Cranford" into "roof-replacement-cranford-a1b2". */
export function makeSlug(service: string, city: string): string {
  const base = `${service}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Herts Roofing & Construction's own business identity — the ONE place this
 * is defined. Used by the sitewide Organization schema (app/layout.tsx) and
 * by every per-project page's "provider" schema.
 *
 * Do not confuse this with a project's location (project.city/state/zip,
 * or the homeowner's private address). A per-project page describes a job
 * site; this describes who Herts is. Mixing the two up means Google (and
 * anyone reading the page source) sees Herts' business "located" at a
 * random customer's ZIP code, which is wrong on every single project page.
 */
export const HERTS_BUSINESS = {
  name: "Herts Roofing & Construction",
  streetAddress: "20 Commerce Drive, Suite 135",
  addressLocality: "Cranford",
  addressRegion: "NJ",
  postalCode: "07016",
  areaServed: ["New Jersey", "Pennsylvania"],
} as const;

export const HERTS_BUSINESS_ADDRESS_LD = {
  "@type": "PostalAddress",
  streetAddress: HERTS_BUSINESS.streetAddress,
  addressLocality: HERTS_BUSINESS.addressLocality,
  addressRegion: HERTS_BUSINESS.addressRegion,
  postalCode: HERTS_BUSINESS.postalCode,
} as const;

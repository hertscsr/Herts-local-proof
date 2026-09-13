import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * Native Next.js sitemap — served at the standard /sitemap.xml, which
 * Google checks automatically even without a robots.txt pointer. Keeps
 * /api/sitemap around too (harmless, same data) in case anything external
 * already points at that URL specifically.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hertsroofingnj.com";

  const { data: projects } = await supabase
    .from("public_projects")
    .select("slug, created_at, city, state");

  const projectUrls: MetadataRoute.Sitemap = (projects ?? []).map((p) => ({
    url: `${siteUrl}/projects/${p.slug}`,
    lastModified: new Date(p.created_at),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // One crawlable URL per distinct service area, so Google has a direct
  // path into each city's project cluster instead of only reaching them by
  // following links from the main /near-me page.
  const cities = new Map<string, string>();
  for (const p of projects ?? []) {
    if (p.city) cities.set(p.city, `${siteUrl}/near-me?city=${encodeURIComponent(p.city)}`);
  }
  const cityUrls: MetadataRoute.Sitemap = Array.from(cities.values()).map((url) => ({
    url,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/near-me`, changeFrequency: "daily", priority: 0.9 },
    ...cityUrls,
    ...projectUrls,
  ];
}

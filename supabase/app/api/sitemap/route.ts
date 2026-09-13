import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Dynamic sitemap fed straight from published projects — regenerates on every
 * request against `revalidate`, so newly published projects show up without
 * a manual sitemap rebuild. Point Search Console at /api/sitemap.
 */
export const revalidate = 3600;

export async function GET() {
  const supabase = createClient();
  const { data: projects } = await supabase
    .from("public_projects")
    .select("slug, created_at");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hertsroofingnj.com";

  const urls = (projects ?? [])
    .map(
      (p) => `
  <url>
    <loc>${siteUrl}/projects/${p.slug}</loc>
    <lastmod>${new Date(p.created_at).toISOString()}</lastmod>
  </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

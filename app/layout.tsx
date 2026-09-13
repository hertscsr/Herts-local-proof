import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hertsroofingnj.com"),
  title: {
    default: "Herts Roofing & Construction | Local Project Gallery",
    template: "%s | Herts Roofing & Construction",
  },
  description:
    "Completed roofing, siding, deck, and gutter projects from Herts Roofing & Construction across NJ and PA.",
};

// Sitewide business schema — separate from the per-project Service schema
// on each project page. This is what tells Google "this whole domain is
// this specific local business," reinforcing every page on the site rather
// than any one page having to carry it alone.
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "RoofingContractor",
  name: "Herts Roofing & Construction",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hertsroofingnj.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "20 Commerce Drive, Suite 135",
    addressLocality: "Cranford",
    addressRegion: "NJ",
    postalCode: "07016",
  },
  areaServed: ["New Jersey", "Pennsylvania"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        {children}
      </body>
    </html>
  );
}

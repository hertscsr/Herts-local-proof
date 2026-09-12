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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}

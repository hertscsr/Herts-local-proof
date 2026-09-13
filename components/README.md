# Herts LocalProof

Local project marketing, review management, lead gen, and local SEO platform
for Herts Roofing & Construction. See `SPEC.md` for the full product spec and
the fixes made to the original brief.

## Stack

- **Next.js 14 (App Router)** — SSR/ISR for public project pages so they're
  actually crawlable, not a client-only SPA
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Tailwind CSS**
- **Vercel** for hosting (native ISR/on-demand revalidation support)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL + keys
```

Run the migrations against a Supabase project (SQL editor or `supabase db push`):

```
supabase/migrations/0001_init.sql   # tables
supabase/migrations/0002_rls.sql    # row level security + public_projects view
```

Then:

```bash
npm run dev
```

## What's built vs. stubbed

Built: full schema + RLS, address-jittering logic (`lib/geo.ts`), public
project page with server-rendered JSON-LD, dynamic sitemap, near-me listing
page, lead-capture API route, admin dashboard with live stat tiles, and the
8-step new-project workflow shell with all fields from the spec.

Stubbed (marked `TODO` in the relevant files, data model already supports
them): photo upload + WebP resize pipeline, project-story auto-generation,
SEO field auto-fill, Google Business review import, GSC indexing-status cron,
and the actual map component on the near-me page (pins should read
`latitude_public`/`longitude_public` only — see `SPEC.md` section 4 before
touching anything geo-related).

## Before this goes live

1. Swap the placeholder brand colors in `tailwind.config.ts` for the real
   Herts hex codes.
2. Decide the Roof Dispatch Pro / Permit Pal integration question in
   `SPEC.md` section 9 — don't let three systems hold three copies of the
   same customer.
3. Get a Google Maps or Mapbox API key for the near-me map component.
4. Set up the Vercel Cron (or Supabase Edge Function schedule) for the GSC
   indexing check described in `SPEC.md` section 5.

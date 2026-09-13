# Herts LocalProof — Product Spec (v2)

Local project marketing, homeowner engagement, review management, lead generation,
and local SEO platform for Herts Roofing & Construction.

Changes from v1 are marked **[FIX]**.

---

## 1. Architecture **[FIX]**

Original spec called for a "modern responsive React application." That's wrong for
half this product's job. The public project pages, the near-me map, and the
homeowner-facing pages exist to rank in Google — a client-side-only React SPA
(Vite/CRA, or Lovable's default output) ships an empty `<div id="root">` to
crawlers and relies on Google's JS rendering queue, which is slower and less
reliable than real HTML.

**Fix: split the app by rendering need.**

- **Public site** (project pages, near-me map, city/service landing pages):
  Next.js App Router, server-rendered or statically generated with ISR (revalidate
  on publish). Real HTML on first response, JSON-LD injected server-side, fast
  Core Web Vitals.
- **Admin/internal app** (dashboard, new-project workflow, photo review, CRM-style
  views): client-rendered inside the same Next.js app, behind Supabase Auth. No
  SEO need here, so this can be as SPA-like as convenient.
- **Backend**: Supabase (Postgres, Auth, Storage, Row Level Security, Edge
  Functions for things like geocoding-on-save and image processing).
- **Hosting**: Vercel (pairs natively with Next.js ISR/ on-demand revalidation).

One codebase, one repo, two rendering strategies inside it.

## 2. User roles (unchanged, RLS-enforced)

Administrator, Office staff, Sales representative, Project manager, Field crew,
Marketing manager, Homeowner/public visitor (unauthenticated).

Every table has RLS policies scoped by role — a field crew member can create
photos on assigned projects but can't see leads or edit published SEO fields;
a homeowner/public visitor only ever reads `publication_status = 'published'`
rows through the public views.

## 3. Database

Same core tables as v1 (projects, photos, reviews, leads, events), with these
additions:

### projects — added columns **[FIX]**
- `latitude_public`, `longitude_public` — the *jittered* coordinates shown on
  the public map. Never the same as the geocoded real address.
- `geocode_source` — how lat/long was derived (address geocode vs manual pin)
- `sitemap_status` — not_submitted / submitted / indexed / needs_recheck
- `last_gsc_check` — timestamp of last Search Console index check

### reviews — added column
- `import_source_id` — external ID from Google/Facebook if pulled via API,
  null if manually entered

### photos — clarified
- `alt_text_auto` (machine-generated draft) and `alt_text_final` (what
  actually publishes) — kept separate so auto-generation never ships unreviewed
  **[FIX]**

## 4. Privacy: address jittering **[FIX]**

v1 said "approximate neighborhood-level locations" without defining "approximate."
That's not a spec, that's a hope. Concrete rule:

1. Geocode the real street address server-side (Edge Function), store it
   encrypted / RLS-locked to admin+office roles only — never exposed to any
   public API route.
2. Generate a public pin by offsetting the real coordinate by a random distance
   of 0.25–0.6 miles in a random direction, re-rolled if the offset pin lands
   outside the same city/ZIP (so it still reads as "local" without being
   reverse-engineerable to a specific block).
3. Store the offset pin in `latitude_public`/`longitude_public`. All public
   queries (map, near-me, project page) read only these columns — the real
   address columns aren't even selectable from the public API role.
4. Distance shown to homeowners ("2.3 miles away") is calculated from the
   *visitor's* location to the jittered pin, not the real address — so the
   displayed distance is already approximate on both ends.

## 5. SEO indexing loop **[FIX]**

v1 had "Indexed/Monitoring" as a workflow stage but nothing feeding it. Fix:

- On publish, ping Google's Indexing API / submit URL to a sitemap that
  regenerates on every publish (`/sitemap.xml`, dynamic route reading published
  projects).
- Weekly scheduled job (Supabase Edge Function + cron, or Vercel Cron) checks
  Search Console API for indexing status per published project URL, updates
  `sitemap_status` and `last_gsc_check`.
- Dashboard surfaces "X published, Y indexed, Z stuck > 14 days" instead of a
  single opaque "Published" checkbox.

## 6. Reviews **[FIX]**

v1 didn't say where reviews come from. Fix: support both paths —
1. Manual entry by office staff (paste text + rating from a client email/text).
2. Optional Google Business Profile API pull, matched to a project by date +
   customer name fuzzy-match, held in a "needs confirmation" queue before
   attaching to a project (never auto-attached — wrong matches are worse than
   no match).

## 7. Photo pipeline **[FIX]**

- Upload → Supabase Storage → resize/compress via Edge Function (WebP,
  multiple sizes: thumbnail / gallery / full) before the project can move to
  "Photos Reviewed."
- Auto-generated filename pattern:
  `{city}-{service-type}-{before|during|after}-{sequence}.webp`
  e.g. `piscataway-nj-roof-replacement-after-01.webp`
- Alt text: auto-drafted from project data (service, city, product), always
  shown to office staff for edit/approval before publish — never ships
  un-reviewed.

## 8. Workflow (unchanged)

New → Scheduled → In Progress → Completed → Photos Reviewed → Review Requested
→ Review Received → Project Story Generated → SEO Reviewed → Published →
Indexed/Monitoring

## 9. Relationship to existing tools **[FIX]**

Herts already runs Roof Dispatch Pro (dispatch) and Permit Pal (permit
tracking) in Lovable, plus Sara (voice receptionist). LocalProof should **not**
re-enter customer/job data that already lives in those systems from scratch —
either integrate (webhook/API pull from Roof Dispatch Pro on job completion to
pre-fill a new LocalProof project) or, if that's not feasible short-term, flag
this clearly as a known duplication to revisit rather than silently maintaining
two customer records that can drift out of sync.

## 10. Everything else from v1 (unchanged)

Admin dashboard metrics, 8-step new-project workflow, product/manufacturer
management, project story generation fields, SEO metadata generation, and the
near-me map filters/card layout all carry over from the original spec as
written — those parts were solid.

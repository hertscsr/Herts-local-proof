-- Google review import, geotagging to a job site, and AI reply drafting.
--
-- project_id becomes nullable: a review pulled from Google arrives with no
-- job site attached — it has to be matched to one (automatically by
-- homeowner name/date, or manually by staff) before it can be geotagged
-- and shown on that project's page. Unmatched reviews just sit in
-- /admin/reviews until someone assigns them.

alter table public.reviews
  alter column project_id drop not null;

alter table public.reviews
  add column if not exists google_review_id text unique,
  add column if not exists reviewer_photo_url text,
  add column if not exists match_status text not null default 'manual'
    check (match_status in ('matched', 'unmatched', 'manual')),
  add column if not exists reply_text text,
  add column if not exists reply_posted_at timestamptz;

-- 'manual' = entered by staff directly (always considered matched to the
-- project they picked). 'unmatched' = pulled from Google, no project guess
-- could be made. 'matched' = pulled from Google and auto-matched to a
-- project (by homeowner name + rough date) — still worth a human glance.
update public.reviews set match_status = 'manual' where source = 'manual';

create index if not exists reviews_google_review_id_idx on public.reviews (google_review_id);

-- Unmatched reviews (project_id null) are never publicly readable — the
-- existing "reviews: anon read approved only" policy from 0002_rls.sql
-- already only exposes rows with approved_for_website = true, and the
-- admin UI never sets that flag until a review has a project assigned.

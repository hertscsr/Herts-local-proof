-- Herts LocalProof — initial schema
-- Roles map to Supabase auth users via a profiles table + custom claim/role column.

create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (extends auth.users with a role)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in (
    'administrator', 'office_staff', 'sales_rep',
    'project_manager', 'field_crew', 'marketing_manager'
  )),
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),

  customer_name text not null,
  customer_email text,
  customer_phone text,

  -- PRIVATE — never selectable by the anon/public role. See RLS below.
  street_address_private text not null,
  latitude_private double precision,
  longitude_private double precision,

  -- PUBLIC — jittered pin + coarse location text. Safe to expose.
  public_location text,
  city text not null,
  state text not null,
  zip text not null,
  latitude_public double precision not null,
  longitude_public double precision not null,
  geocode_source text not null default 'geocoded' check (geocode_source in ('geocoded', 'manual_pin')),

  service_type text not null check (service_type in (
    'roof_replacement', 'roof_repair', 'storm_damage', 'siding',
    'gutters', 'windows', 'deck_construction', 'composite_deck', 'chimney'
  )),
  project_type text,
  manufacturer text,
  product text,
  product_line text,
  product_color text,
  project_description text,
  problems_discovered text,
  work_performed text,
  special_features text,
  completion_date date,
  sales_rep text,
  project_manager text,

  project_status text not null default 'new' check (project_status in (
    'new', 'scheduled', 'in_progress', 'completed', 'photos_reviewed',
    'review_requested', 'review_received', 'story_generated',
    'seo_reviewed', 'published', 'indexed_monitoring'
  )),
  review_status text not null default 'not_requested' check (review_status in (
    'not_requested', 'requested', 'received'
  )),
  publication_status text not null default 'draft' check (publication_status in (
    'draft', 'in_review', 'published', 'unpublished'
  )),

  slug text unique not null,
  seo_title text,
  meta_description text,
  target_keyword text,
  canonical_url text,
  sitemap_status text not null default 'not_submitted' check (sitemap_status in (
    'not_submitted', 'submitted', 'indexed', 'needs_recheck'
  )),
  last_gsc_check timestamptz,

  -- generated project story fields
  page_title text,
  h1 text,
  introduction text,
  project_challenge text,
  solution text,
  materials_used text,
  faq jsonb,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_city_idx on public.projects (city);
create index projects_service_type_idx on public.projects (service_type);
create index projects_publication_status_idx on public.projects (publication_status);
create index projects_geo_idx on public.projects (latitude_public, longitude_public);

-- ============================================================
-- PHOTOS
-- ============================================================
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase text not null check (phase in ('before', 'during', 'after')),
  storage_path text not null,
  caption text,
  alt_text_auto text,
  alt_text_final text,
  display_order integer not null default 0,
  upload_date timestamptz not null default now()
);

create index photos_project_idx on public.photos (project_id);

-- ============================================================
-- REVIEWS
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  homeowner text not null,
  rating integer not null check (rating between 1 and 5),
  review text not null,
  source text not null default 'manual' check (source in ('manual', 'google', 'facebook')),
  import_source_id text,
  date date not null default current_date,
  approved_for_website boolean not null default false
);

create index reviews_project_idx on public.reviews (project_id);

-- ============================================================
-- LEADS
-- ============================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  zip text,
  service text,
  project_id_that_generated_lead uuid references public.projects(id) on delete set null,
  page_url text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  date timestamptz not null default now(),
  lead_status text not null default 'new' check (lead_status in (
    'new', 'contacted', 'qualified', 'won', 'lost'
  ))
);

create index leads_project_idx on public.leads (project_id_that_generated_lead);
create index leads_status_idx on public.leads (lead_status);

-- ============================================================
-- EVENTS (analytics)
-- ============================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  visitor_session text not null,
  page text not null,
  project_id uuid references public.projects(id) on delete set null,
  event_type text not null check (event_type in (
    'page_view', 'gallery_view', 'cta_click', 'lead_submit', 'map_pin_click'
  )),
  timestamp timestamptz not null default now()
);

create index events_project_idx on public.events (project_id);
create index events_timestamp_idx on public.events (timestamp);

-- ============================================================
-- MANUFACTURERS / PRODUCTS (admin-managed catalog)
-- ============================================================
create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('roofing', 'siding', 'decking', 'gutters', 'windows'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  collection text,
  product_name text not null,
  colors text[] default '{}'
);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

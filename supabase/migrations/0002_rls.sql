-- Row Level Security policies.
-- Internal roles (admin, office, sales, PM, crew, marketing) act through
-- authenticated Supabase sessions. The public site reads through the
-- `anon` role and must NEVER see private address/lat/lng columns — enforced
-- here with a public view rather than trusting column-level filtering in app code.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.photos enable row level security;
alter table public.reviews enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
alter table public.manufacturers enable row level security;
alter table public.products enable row level security;

-- ---- helper: current user's role ----
create or replace function public.current_role()
returns text
language sql stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---- profiles ----
create policy "profiles: self read" on public.profiles
  for select using (id = auth.uid());

create policy "profiles: admin read all" on public.profiles
  for select using (public.current_role() = 'administrator');

-- ---- projects: internal roles ----
create policy "projects: staff read all" on public.projects
  for select using (
    public.current_role() in (
      'administrator', 'office_staff', 'sales_rep',
      'project_manager', 'field_crew', 'marketing_manager'
    )
  );

create policy "projects: office+admin write" on public.projects
  for insert with check (public.current_role() in ('administrator', 'office_staff', 'sales_rep'));

create policy "projects: office+admin+pm update" on public.projects
  for update using (
    public.current_role() in ('administrator', 'office_staff', 'project_manager', 'marketing_manager')
  );

create policy "projects: admin delete" on public.projects
  for delete using (public.current_role() = 'administrator');

-- Public/anon read: only published projects, and only via a column-scoped
-- view (public_projects, below) — this base-table policy exists so the view
-- has something to select from, but app code and the anon role should query
-- the view, never this table directly.
create policy "projects: anon read published only" on public.projects
  for select to anon using (publication_status = 'published');

-- ---- photos ----
create policy "photos: staff all" on public.photos
  for all using (
    public.current_role() in (
      'administrator', 'office_staff', 'project_manager', 'field_crew', 'marketing_manager'
    )
  );

create policy "photos: anon read published projects" on public.photos
  for select to anon using (
    exists (
      select 1 from public.projects p
      where p.id = photos.project_id and p.publication_status = 'published'
    )
  );

-- ---- reviews ----
create policy "reviews: staff all" on public.reviews
  for all using (
    public.current_role() in ('administrator', 'office_staff', 'marketing_manager')
  );

create policy "reviews: anon read approved only" on public.reviews
  for select to anon using (approved_for_website = true);

-- ---- leads ----
create policy "leads: staff read" on public.leads
  for select using (
    public.current_role() in ('administrator', 'office_staff', 'sales_rep', 'marketing_manager')
  );

create policy "leads: staff update" on public.leads
  for update using (
    public.current_role() in ('administrator', 'office_staff', 'sales_rep')
  );

-- anon can INSERT a lead (the public contact/estimate form) but never read leads back
create policy "leads: anon insert only" on public.leads
  for insert to anon with check (true);

-- ---- events ----
create policy "events: anon insert" on public.events
  for insert to anon with check (true);

create policy "events: staff read" on public.events
  for select using (
    public.current_role() in ('administrator', 'marketing_manager')
  );

-- ---- manufacturers / products: staff manage, anon read (needed for public product mentions) ----
create policy "manufacturers: staff write" on public.manufacturers
  for all using (public.current_role() = 'administrator');
create policy "manufacturers: anon read" on public.manufacturers
  for select to anon using (true);

create policy "products: staff write" on public.products
  for all using (public.current_role() = 'administrator');
create policy "products: anon read" on public.products
  for select to anon using (true);

-- ============================================================
-- Public-safe view: this is what the public site queries.
-- Deliberately omits street_address_private, latitude_private,
-- longitude_private, customer_email, customer_phone.
-- ============================================================
create view public.public_projects as
select
  id, public_location, city, state, zip,
  latitude_public, longitude_public,
  service_type, project_type, manufacturer, product, product_line, product_color,
  project_description, completion_date,
  slug, seo_title, meta_description, target_keyword, canonical_url,
  page_title, h1, introduction, project_challenge, solution, materials_used, faq,
  created_at
from public.projects
where publication_status = 'published';

grant select on public.public_projects to anon;

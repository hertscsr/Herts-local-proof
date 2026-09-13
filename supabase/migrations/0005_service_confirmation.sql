-- Stops auto-import from ever guessing a service type. Previously, when a
-- CompanyCam project's labels didn't match anything in LABEL_TO_SERVICE_TYPE,
-- the app silently defaulted it to 'roof_replacement' and only a text marker
-- in the description ("[SERVICE TYPE NEEDS REVIEW]") hinted that it was a
-- guess. That's how a Clark, NJ job with no matching label ended up showing
-- as "roof replacement" with nobody realizing it was never confirmed.
--
-- Going forward: no match = service_type stays NULL and service_confirmed
-- stays false, so it can never accidentally read as a real, chosen value.

alter table public.projects
  alter column service_type drop not null;

alter table public.projects
  add column if not exists service_confirmed boolean not null default false;

-- Existing rows: nothing already published or already past the old
-- "NEEDS REVIEW" marker should suddenly start blocking on this new flag.
-- Anything published is being treated by definition as staff-confirmed
-- (a human already published it). Anything still carrying the old
-- needs-review marker in its description stays unconfirmed, matching what
-- it already visually was.
update public.projects
set service_confirmed = true
where service_type is not null
  and (project_description is null or project_description not like '%NEEDS REVIEW%');

comment on column public.projects.service_confirmed is
  'True once a human has confirmed service_type (by publishing, by explicitly setting it, or by using "Re-check type from CompanyCam" and getting a real match). Never set true by an auto-import guess.';

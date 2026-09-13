-- Links a LocalProof project back to its source CompanyCam project so the
-- webhook can upsert instead of creating duplicates every time a project
-- gets re-tagged or gets new photos added after the initial import.

alter table public.projects
  add column companycam_project_id text unique;

create index projects_companycam_id_idx on public.projects (companycam_project_id);

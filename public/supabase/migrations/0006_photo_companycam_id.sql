-- Gives every imported photo its own real link back to CompanyCam, instead
-- of the app guessing it by parsing the storage filename
-- ("{project_id}/{photo_id}.jpg") every time it needs to check for a
-- duplicate. That parsing trick works today but is fragile — any future
-- code path that writes a photo row with a different filename shape (a
-- manual upload, a resize/derivative step, a rename) would silently break
-- dedup with no error, just quietly-duplicated photos on re-import.

alter table public.photos
  add column if not exists companycam_photo_id text;

-- Only CompanyCam-imported photos have one; manually-uploaded photos (via
-- /api/projects/:id/photos) don't come from CompanyCam at all, so this
-- can't be NOT NULL — but where it IS set, it must be unique so two
-- imports of the same CompanyCam photo can never both insert.
create unique index if not exists photos_companycam_photo_id_key
  on public.photos (companycam_photo_id)
  where companycam_photo_id is not null;

-- Backfill from the existing filename convention
-- ("{project_id}/{photo_id}.jpg") so photos already imported before this
-- migration aren't silently untracked and don't get re-downloaded/duplicated
-- the next time their project is touched.
update public.photos
set companycam_photo_id = split_part(storage_path, '/', 2)
where companycam_photo_id is null
  and storage_path ~ '^[0-9a-f-]+/[^/]+\.[a-zA-Z0-9]+$';

-- Strip the extension the backfill above left on (split_part gets us
-- "abc123.jpg" — CompanyCam photo ids don't have a dot in them).
update public.photos
set companycam_photo_id = split_part(companycam_photo_id, '.', 1)
where companycam_photo_id is not null;

comment on column public.photos.companycam_photo_id is
  'CompanyCam''s own photo id. Null for photos uploaded directly through the admin UI rather than imported. The source of truth for import dedup — never parse storage_path for this again.';

-- 043 (2026-11-18): the badge-icons Storage bucket (custom badge pictures,
-- uploaded from the admin — js/db.js BadgeIcons) writable by admins only.
-- Its insert / update / delete policies were made in the dashboard when
-- "signed in" still meant "admin" (auth.role() = 'authenticated'), and
-- migration 001's switch to is_admin() only covered the public tables — so
-- since player login any Google account could upload files to the public
-- bucket, or overwrite / delete the badges' pictures. Now is_admin(), like
-- every table; reading stays public (the pictures are shown site-wide by
-- their public URL). The bucket also refuses what the admin's form would:
-- only PNG / JPEG / WebP, at most 300 KB (badges-admin.js
-- MAX_ICON_FILE_BYTES). Safe to run again. Rollback:
-- 043_badge_icons_admin_only_rollback.sql.

update storage.buckets
set file_size_limit = 307200,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'badge-icons';

drop policy if exists "badge-icons_admin_insert" on storage.objects;
drop policy if exists "badge-icons_admin_update" on storage.objects;
drop policy if exists "badge-icons_admin_delete" on storage.objects;

create policy "badge-icons_admin_insert" on storage.objects
  for insert with check (bucket_id = 'badge-icons' and public.is_admin());
create policy "badge-icons_admin_update" on storage.objects
  for update using (bucket_id = 'badge-icons' and public.is_admin())
  with check (bucket_id = 'badge-icons' and public.is_admin());
create policy "badge-icons_admin_delete" on storage.objects
  for delete using (bucket_id = 'badge-icons' and public.is_admin());

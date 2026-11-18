-- Rollback of 043: the badge-icons bucket's write policies back to "any
-- signed-in account" (as they were — not recommended), no size / type limit.

update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'badge-icons';

drop policy if exists "badge-icons_admin_insert" on storage.objects;
drop policy if exists "badge-icons_admin_update" on storage.objects;
drop policy if exists "badge-icons_admin_delete" on storage.objects;

create policy "badge-icons_admin_insert" on storage.objects
  for insert with check (bucket_id = 'badge-icons' and auth.role() = 'authenticated');
create policy "badge-icons_admin_update" on storage.objects
  for update using (bucket_id = 'badge-icons' and auth.role() = 'authenticated');
create policy "badge-icons_admin_delete" on storage.objects
  for delete using (bucket_id = 'badge-icons' and auth.role() = 'authenticated');

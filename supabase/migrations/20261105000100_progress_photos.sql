-- Public bucket for progress photos: images only, up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- Anyone (logged in or not) can add files to the bucket.
-- There is no update or delete policy, so nobody can change or remove them through the API.
create policy "Anyone can upload progress photos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'progress-photos');

-- Each session can have several photos; the list is empty when there are none.
alter table public.sessions add column photo_urls text[] not null default '{}';

-- Privacy tightening: every person's data and photos are theirs alone.

-- 1. Website roles get only the permissions they need (read/add/change/delete rows, all still
--    limited to your own rows by Row Level Security). TRUNCATE ignores Row Level Security, so it goes.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on public.ai_requests from anon, authenticated;

-- 2. A logged result can only point at one of your own exercises (not someone else's by its number).
alter table public.exercises add constraint exercises_id_user_id_key unique (id, user_id);
alter table public.session_exercises drop constraint session_exercises_exercise_id_fkey;
alter table public.session_exercises add constraint session_exercises_exercise_id_user_id_fkey
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade;

-- 3. Progress photos become private.
--    The bucket is no longer public: a photo can only be opened through a short-lived link
--    that the website asks for, and only the owner can get one.
update storage.buckets set public = false where id = 'progress-photos';
drop policy if exists "Anyone can upload progress photos" on storage.objects;

-- Logged-in people can add photos only into their own folder (<their user id>/...).
create policy "Upload own progress photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ...and see only the photos in their own folder.
create policy "View own progress photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No update or delete policies: nobody can change or remove photos from the website.

-- 4. sessions.photo_urls now holds the photo's place in the bucket ("<user id>/<file>.png")
--    instead of a public link. Existing links are converted, and the test cartoon
--    (in the shared "test" folder) is taken off the session. The file itself stays in storage.
update public.sessions
set photo_urls = coalesce((
  select array_agg(regexp_replace(u, '^.*/progress-photos/', '') order by i)
  from unnest(photo_urls) with ordinality as p(u, i)
  where regexp_replace(u, '^.*/progress-photos/', '') not like 'test/%'
), '{}')
where cardinality(photo_urls) > 0;

-- Photos added to a session must be in the owner's own folder.
alter table public.sessions add constraint sessions_photos_own_folder check (
  array_to_string(photo_urls, '|') = '' or
  array_to_string(photo_urls, '|') ~ ('^(' || user_id::text || '/[^|/]+)(\|' || user_id::text || '/[^|/]+)*$')
);

-- Each workout belongs to the logged-in user who created it.
alter table public.workouts
  add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;

create index workouts_user_id_idx on public.workouts (user_id);

-- Replace the open policies: users can only see and change their own rows.
drop policy "public read"   on public.workouts;
drop policy "public insert" on public.workouts;
drop policy "public update" on public.workouts;
drop policy "public delete" on public.workouts;

create policy "own read"   on public.workouts for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.workouts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.workouts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.workouts for delete to authenticated using ((select auth.uid()) = user_id);

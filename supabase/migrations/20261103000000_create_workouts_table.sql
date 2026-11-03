-- Weekly workout schedule: one row per exercise on a training day.
-- A day with no rows is a rest day.
create type public.day_of_week as enum
  ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday');

create table public.workouts (
  id           bigint generated always as identity primary key,
  day_of_week  public.day_of_week not null,
  exercise     text not null,            -- e.g. Bench Press
  sets         smallint not null check (sets > 0),
  reps         smallint not null check (reps > 0),
  created_at   timestamptz not null default now()
);

-- No login yet: anyone with the app's key can read/write.
alter table public.workouts enable row level security;
create policy "public read"   on public.workouts for select to anon, authenticated using (true);
create policy "public insert" on public.workouts for insert to anon, authenticated with check (true);
create policy "public update" on public.workouts for update to anon, authenticated using (true) with check (true);
create policy "public delete" on public.workouts for delete to anon, authenticated using (true);

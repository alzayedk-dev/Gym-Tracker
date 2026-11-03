create type public.workout_type as enum
  ('Upper','Lower','Push','Pull','Legs','Full body','Cardio');

create type public.muscle_group as enum
  ('Chest','Back','Arms','Shoulders','Legs','Core','Full body');

-- A user's weekly plan: at most one workout per day.
create table public.workout_days (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week  public.day_of_week not null,
  workout_type public.workout_type not null,
  created_at   timestamptz not null default now(),
  unique (user_id, day_of_week)
);

-- Exercises belong to a day in the plan.
alter table public.workouts rename to exercises;
alter table public.exercises
  drop column entry_date,
  drop column completed,
  add column muscle_groups public.muscle_group[] not null default '{}',
  add constraint exercises_day_fkey foreign key (user_id, day_of_week)
    references public.workout_days (user_id, day_of_week) on delete cascade on update cascade;
drop index if exists public.workouts_user_id_idx;
create index exercises_user_day_idx on public.exercises (user_id, day_of_week);

-- One row each time a user finishes a day's workout.
create table public.workout_completions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  completed_on date not null default current_date,
  day_of_week  public.day_of_week not null,
  workout_type public.workout_type not null,
  created_at   timestamptz not null default now(),
  unique (user_id, completed_on, day_of_week)
);

alter table public.workout_days enable row level security;
alter table public.workout_completions enable row level security;

create policy "own read"   on public.workout_days for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.workout_days for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.workout_days for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.workout_days for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own read"   on public.workout_completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.workout_completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.workout_completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.workout_completions for delete to authenticated using ((select auth.uid()) = user_id);

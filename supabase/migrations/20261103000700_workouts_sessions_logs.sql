-- New model:
--   workout           a planned workout: one type, on several weekdays (recurring) or exact dates (one-off)
--   exercises         the exercises planned in a workout
--   sessions          one workout on one date; holds the "completed" tick
--   session_exercises what was actually done for each exercise in a session (sets, reps, weights)
-- Existing workouts are kept: each old day becomes a recurring workout on that weekday.

-- Workout types are now just Full body, Upper, Lower.
create type public.training_type as enum ('Full body', 'Upper', 'Lower');

-- Exercises: point at a workout id instead of a weekday.
alter table public.exercises drop constraint exercises_day_fkey;
alter table public.exercises add column workout_id bigint;
update public.exercises e set workout_id = w.id
  from public.workout w where w.user_id = e.user_id and w.day_of_week = e.day_of_week;
alter table public.exercises
  drop column day_of_week,
  alter column workout_id set not null,
  add column position smallint not null default 0;
drop index if exists public.exercises_user_day_idx;

-- Workout: several weekdays or exact dates, recurring flag, archive instead of delete.
alter table public.workout drop constraint workout_user_id_day_of_week_key;
alter table public.workout
  add column recurring boolean not null default true,
  add column days public.day_of_week[] not null default '{}',
  add column dates date[] not null default '{}',
  add column archived_at timestamptz;
update public.workout set days = array[day_of_week];
alter table public.workout
  drop column day_of_week,
  alter column workout_type type public.training_type using workout_type::text::public.training_type,
  add constraint workout_when_check check (
    (recurring and cardinality(days) > 0 and cardinality(dates) = 0) or
    (not recurring and cardinality(dates) > 0 and cardinality(days) = 0)
  ),
  add constraint workout_id_user_key unique (id, user_id);

alter table public.exercises
  add constraint exercises_workout_fkey foreign key (workout_id, user_id)
    references public.workout (id, user_id) on delete cascade;
create index exercises_workout_idx on public.exercises (workout_id, position);

-- Completions are replaced by sessions.
drop table public.workout_completions;
drop type public.workout_type;
alter type public.training_type rename to workout_type;

create table public.sessions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id   bigint not null,
  session_date date not null,
  completed    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (workout_id, session_date),
  unique (id, user_id),
  foreign key (workout_id, user_id) references public.workout (id, user_id) on delete cascade
);
create index sessions_user_date_idx on public.sessions (user_id, session_date);

create table public.session_exercises (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id   bigint not null,
  exercise_id  bigint not null references public.exercises (id) on delete cascade,
  sets         smallint check (sets > 0),
  reps         text check (char_length(reps) between 1 and 20),
  weights      numeric(6,2)[] check (0 <= all (weights)),
  weight_unit  public.weight_unit not null default 'kg',
  created_at   timestamptz not null default now(),
  unique (session_id, exercise_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);
create index session_exercises_exercise_idx on public.session_exercises (exercise_id);

-- Security: each user only sees and changes their own rows.
alter table public.sessions enable row level security;
alter table public.session_exercises enable row level security;

create policy "own read"   on public.sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own read"   on public.session_exercises for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.session_exercises for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.session_exercises for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.session_exercises for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.sessions, public.session_exercises to authenticated, service_role;

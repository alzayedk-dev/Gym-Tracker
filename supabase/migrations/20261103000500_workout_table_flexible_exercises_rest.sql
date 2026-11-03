-- The weekly plan table is called "workout": one workout per day, holding 1 or many exercises.
alter table public.workout_days rename to workout;
alter table public.workout rename constraint workout_days_user_id_fkey to workout_user_id_fkey;
alter table public.workout rename constraint workout_days_user_id_day_of_week_key to workout_user_id_day_of_week_key;

-- Only the exercise name is required. Reps can be text (e.g. "AMRAP", "max"),
-- weights is a list (one per set), and rest is in 15-second steps.
alter table public.exercises
  alter column sets drop not null,
  drop constraint if exists workouts_sets_check,
  add constraint exercises_sets_check check (sets > 0),
  alter column reps drop not null,
  alter column reps type text using reps::text,
  drop constraint if exists workouts_reps_check,
  add constraint exercises_reps_check check (char_length(reps) between 1 and 20),
  drop column weight,
  add column weights numeric(6,2)[],
  add constraint exercises_weights_check check (0 <= all (weights)),
  add column rest_seconds smallint,
  add constraint exercises_rest_check check (rest_seconds > 0 and rest_seconds % 15 = 0),
  add constraint exercises_name_check check (char_length(trim(exercise)) > 0);

alter table public.exercises rename constraint workouts_user_id_fkey to exercises_user_id_fkey;

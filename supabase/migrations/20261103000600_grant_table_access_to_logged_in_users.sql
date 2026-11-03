-- Let logged-in users use the tables at all. Row Level Security still limits
-- each user to their own rows; without these grants every request is refused
-- with "permission denied for table ...".
grant select, insert, update, delete on public.workout, public.exercises, public.workout_completions to authenticated;
grant select, insert, update, delete on public.workout, public.exercises, public.workout_completions to service_role;

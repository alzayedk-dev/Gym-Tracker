-- Date the entry is for, weight lifted (empty for bodyweight), and whether it was done.
alter table public.workouts
  add column entry_date date not null default current_date,
  add column weight numeric(6,2) check (weight >= 0),
  add column completed boolean not null default false;

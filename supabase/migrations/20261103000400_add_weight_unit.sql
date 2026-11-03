-- Each exercise's weight is in kg or lbs.
create type public.weight_unit as enum ('kg', 'lbs');
alter table public.exercises add column weight_unit public.weight_unit not null default 'kg';

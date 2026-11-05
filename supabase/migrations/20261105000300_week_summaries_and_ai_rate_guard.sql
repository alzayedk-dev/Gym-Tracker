-- Week summaries: one per person per week (Monday date), made by the "week-summary" edge function.
create table public.week_summaries (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),  -- always a Monday
  summary     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.week_summaries enable row level security;
create policy "own read"   on public.week_summaries for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.week_summaries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.week_summaries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.week_summaries for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.week_summaries to authenticated, service_role;

-- Rate guard for the AI: at most 5 AI requests a minute in total (coach, workout and week summaries),
-- so the free OpenRouter allowance (about 50 a day) can't be burned quickly.
-- Nobody can read or write this table directly; only ai_take_slot() touches it.
create table public.ai_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  fn          text not null,
  created_at  timestamptz not null default now()
);
alter table public.ai_requests enable row level security;
create index ai_requests_created_at on public.ai_requests (created_at);

-- Returns true and records the request if there's room this minute, false otherwise.
create function public.ai_take_slot(fn text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_take_slot'));  -- one check at a time, so 6 at once can't all pass
  delete from public.ai_requests where created_at < now() - interval '1 day';
  select count(*) into used from public.ai_requests where created_at > now() - interval '1 minute';
  if used >= 5 then
    return false;
  end if;
  insert into public.ai_requests (user_id, fn) values (auth.uid(), fn);
  return true;
end;
$$;
revoke execute on function public.ai_take_slot(text) from public, anon;
grant execute on function public.ai_take_slot(text) to authenticated, service_role;

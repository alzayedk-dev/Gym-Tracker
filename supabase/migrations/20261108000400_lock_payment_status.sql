-- Lock down payment rows: only the server (service role, used by the payment edge functions) can write them,
-- and only the payment-callback function changes the status.
--
-- Layers:
--   1. Table permissions: website users (anon = logged out, authenticated = logged in, including anyone
--      who calls themselves an admin in the browser) have no insert / update / delete permission at all.
--   2. Row Level Security: explicit "no writes" policies for those roles, so even an accidental future
--      grant can't open writes. Logged-in users keep read access to their own rows only.
--   3. A trigger guard (works even for roles that skip Row Level Security):
--      - new rows always start as 'pending' (create-payment only creates pending rows)
--      - only the service role can change status, and only along pending → paid, pending → failed,
--        failed → paid (a retry that succeeds). A paid payment is final.
--      - who paid, the plan and the amount can never change after the row is created.
--   The database owner (postgres, i.e. you in the Supabase dashboard) can still fix a row by hand for support.

-- 1. Permissions
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke all on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;
grant select, insert, update on public.subscriptions to service_role;

-- 2. Row Level Security: reads of your own rows only; writes from the website are refused outright.
create policy "no writes from the website" on public.subscriptions
  as restrictive for insert to anon, authenticated with check (false);
create policy "no updates from the website" on public.subscriptions
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no deletes from the website" on public.subscriptions
  as restrictive for delete to anon, authenticated using (false);

-- 3. Status guard
create function public.guard_subscription_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  who text := current_user;
begin
  if who not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Payment rows can only be written by the payment server.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'New payments must start as pending.';
    end if;
    return new;
  end if;

  -- UPDATE
  if who = 'service_role' then
    if new.user_id <> old.user_id or new.plan <> old.plan or new.amount <> old.amount or new.currency <> old.currency then
      raise exception 'Who paid, the plan and the amount cannot change.';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'pending' and new.status in ('paid', 'failed')) or
         (old.status = 'failed'  and new.status = 'paid')
       ) then
      raise exception 'Payment status cannot change from % to %.', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger subscriptions_guard_writes
  before insert or update on public.subscriptions
  for each row execute function public.guard_subscription_writes();

-- Payment status can only be written by the server (the service role, used by the payment edge functions).
-- Customers and anyone else using the website can only read their own payment rows.
-- Three layers, so one mistake later (e.g. a new policy or grant) can't open it up.

-- 1. Permissions: website roles may only read. The server may read, add and update, but never delete
--    or wipe payments; they're a permanent record.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke delete, truncate on public.subscriptions from service_role;

-- 2. Restrictive policies are ANDed with every other policy, so even if someone later adds
--    a policy that allows writes, website users are still refused. (Reading your own rows
--    stays allowed by the "own read" policy.)
create policy "website users never insert payments" on public.subscriptions
  as restrictive for insert to anon, authenticated with check (false);
create policy "website users never update payments" on public.subscriptions
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "website users never delete payments" on public.subscriptions
  as restrictive for delete to anon, authenticated using (false);

-- 3. Column guard: status and the fields that decide whether the AI coach is unlocked
--    can only be set or changed by the service role.
create function public.guard_payment_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The service role (payment edge functions) and database admins doing maintenance are allowed.
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.status     is distinct from old.status
     or new.amount     is distinct from old.amount
     or new.plan       is distinct from old.plan
     or new.user_id    is distinct from old.user_id
     or new.paid_at    is distinct from old.paid_at
     or new.starts_at  is distinct from old.starts_at
     or new.ends_at    is distinct from old.ends_at
     or new.payment_id is distinct from old.payment_id then
    raise exception 'Only the payment server can change payment status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger subscriptions_guard_payment_columns
  before insert or update on public.subscriptions
  for each row execute function public.guard_payment_columns();

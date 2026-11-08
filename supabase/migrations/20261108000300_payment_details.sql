-- More detail on each payment, for receipts, support questions and checking against MyFatoorah / bank statements.
alter table public.subscriptions
  add column failed_at         timestamptz,  -- when MyFatoorah reported it failed or cancelled
  add column updated_at        timestamptz not null default now(),  -- last time this row changed
  add column payment_method    text,         -- e.g. "KNET", as MyFatoorah reports it
  add column transaction_id    text,         -- MyFatoorah transaction ID
  add column reference_id      text,         -- bank / KNET reference number
  add column track_id          text,         -- KNET track ID
  add column authorization_id  text,         -- KNET authorization code (successful payments)
  add column invoice_reference text,         -- MyFatoorah invoice reference shown on receipts
  add column failure_reason    text;         -- why it failed, as MyFatoorah explains it

-- Keep updated_at current on every change.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- A failed row must say when it failed.
alter table public.subscriptions
  add constraint subscriptions_failed_has_time check (status <> 'failed' or failed_at is not null) not valid;

-- Subscriptions: one row per payment attempt for the AI coach (monthly 3 KD, yearly 30 KD, paid by KNET
-- through MyFatoorah). Rows are created and confirmed only by the payment edge functions
-- (create-payment, payment-callback), which check the payment with MyFatoorah first.
-- People can read their own rows to see if they're subscribed, but can't add or change them,
-- so nobody can make themselves "paid" without paying.
create table public.subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan        text not null check (plan in ('monthly', 'yearly')),
  amount      numeric(10, 3) not null check (amount > 0),
  currency    text not null default 'KWD',
  status      text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  invoice_id  bigint unique,          -- MyFatoorah invoice for this attempt
  payment_id  text,                   -- MyFatoorah payment that confirmed it
  starts_at   timestamptz,            -- when the paid time starts (after any time you already had)
  ends_at     timestamptz,            -- when it runs out
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (status <> 'paid' or (starts_at is not null and ends_at > starts_at))
);
create index subscriptions_user_ends on public.subscriptions (user_id, ends_at desc);

alter table public.subscriptions enable row level security;
create policy "own read" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
-- No insert / update / delete policies for website users: only the edge functions (service role) write.
grant select on public.subscriptions to authenticated;
grant select, insert, update on public.subscriptions to service_role;

-- New tables get broad default permissions; keep website users to reading their own rows.
revoke all on public.subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on public.subscriptions from authenticated;

-- Who paid, as shown on the MyFatoorah payment page (copied at the time of payment).
alter table public.subscriptions
  add column customer_name   text,
  add column customer_email  text,
  add column customer_mobile text check (customer_mobile is null or customer_mobile ~ '^[0-9]{8}$'),  -- Kuwait, without +965
  add column payment_url     text;  -- the MyFatoorah payment link for this attempt

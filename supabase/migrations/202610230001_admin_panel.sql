-- Admiral Post admin panel: quote inbox and shipment register.
-- Run in Supabase SQL Editor after creating a project.
create extension if not exists pgcrypto;

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'website' check (source in ('website','admin')),
  language text not null default 'ru' check (language in ('ru','en')),
  customer_name text not null,
  phone text not null,
  email text not null,
  destination text not null,
  weight_kg numeric(10,2) not null check (weight_kg > 0 and weight_kg <= 1000),
  contents text not null default '',
  message text not null default '',
  status text not null default 'new' check (status in ('new','in_progress','waiting_customer','quoted','converted','closed','spam')),
  admin_notes text not null default '',
  consent boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tracking_number text unique,
  customer_name text not null,
  phone text not null,
  email text not null default '',
  destination text not null,
  weight_kg numeric(10,2) not null check (weight_kg > 0 and weight_kg <= 1000),
  contents text not null default '',
  service_type text not null default 'sea' check (service_type in ('sea','air','other')),
  status text not null default 'registered' check (status in ('registered','received','sorting','in_transit','customs','out_for_delivery','delivered','exception','cancelled')),
  declared_value numeric(12,2),
  currency text not null default 'USD',
  admin_notes text not null default ''
);

create table if not exists public.request_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1
);

create index if not exists quote_requests_created_at_idx on public.quote_requests(created_at desc);
create index if not exists quote_requests_status_idx on public.quote_requests(status);
create index if not exists shipments_created_at_idx on public.shipments(created_at desc);
create index if not exists shipments_status_idx on public.shipments(status);
create index if not exists shipments_tracking_number_idx on public.shipments(tracking_number);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists quote_requests_set_updated_at on public.quote_requests;
create trigger quote_requests_set_updated_at before update on public.quote_requests
for each row execute function public.set_updated_at();
drop trigger if exists shipments_set_updated_at on public.shipments;
create trigger shipments_set_updated_at before update on public.shipments
for each row execute function public.set_updated_at();

alter table public.quote_requests enable row level security;
alter table public.shipments enable row level security;
alter table public.request_rate_limits enable row level security;

revoke all on public.quote_requests from anon, authenticated;
revoke all on public.shipments from anon, authenticated;
revoke all on public.request_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.quote_requests to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;

drop policy if exists "admin manages quote requests" on public.quote_requests;
create policy "admin manages quote requests" on public.quote_requests
for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')
with check ((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

drop policy if exists "admin manages shipments" on public.shipments;
create policy "admin manages shipments" on public.shipments
for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')
with check ((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

-- The Edge Function uses its server-side secret key to write quote requests and rate-limit records.
-- Do not grant anon access to either table.

-- Explicit grants for the trusted Edge Function role.
grant insert on public.quote_requests to service_role;
grant select, insert, update, delete on public.request_rate_limits to service_role;

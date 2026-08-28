-- Run after 003. EMS-owner managed license catalogue and per-administrator shop capacity.
create table public.license_plans (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 duration_months integer not null check(duration_months > 0),
 max_stores integer not null check(max_stores > 0),
 benefits text not null default '',
 payment_details text not null default '',
 price numeric(12,2) not null default 0 check(price >= 0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.licenses add column if not exists admin_id uuid references public.administrators(id) on delete cascade;
alter table public.licenses add column if not exists plan_id uuid references public.license_plans(id) on delete set null;
alter table public.licenses add column if not exists max_stores integer not null default 1 check(max_stores > 0);
update public.licenses l set admin_id=s.admin_id from public.stores s where l.store_id=s.id and l.admin_id is null;
alter table public.licenses alter column store_id drop not null;
create index if not exists licenses_admin_status_idx on public.licenses(admin_id,status);
revoke all on public.license_plans from anon,authenticated;
alter table public.license_plans enable row level security;

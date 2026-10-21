-- Business AI Health: run once in Supabase SQL Editor AFTER migrations 017–021.
-- It is read-only at runtime; this migration only adds entitlement/configuration/history tables.
alter table public.license_plans add column if not exists business_health_enabled boolean not null default false;
alter table public.license_plans add column if not exists business_health_daily_limit integer not null default 0 check(business_health_daily_limit >= 0);
alter table public.licenses add column if not exists business_health_enabled boolean not null default false;
alter table public.licenses add column if not exists business_health_daily_limit integer not null default 0 check(business_health_daily_limit >= 0);
alter table public.current_entitlements add column if not exists business_health_enabled boolean not null default false;
alter table public.current_entitlements add column if not exists business_health_daily_limit integer not null default 0 check(business_health_daily_limit >= 0);

create table if not exists public.business_health_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 model text not null default '@cf/meta/llama-3.2-3b-instruct',
 global_daily_limit integer not null default 100 check(global_daily_limit > 0),
 updated_by uuid references public.ems_owners(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.business_health_reports (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 user_id uuid not null,
 start_date date not null,
 end_date date not null,
 score integer not null check(score between 0 and 100),
 snapshot jsonb not null default '{}'::jsonb,
 insights text not null,
 created_at timestamptz not null default now(),
 check(start_date <= end_date)
);
create index if not exists business_health_reports_store_date_idx on public.business_health_reports(store_id,created_at desc);
revoke all on public.business_health_settings,public.business_health_reports from anon,authenticated;
alter table public.business_health_settings enable row level security;
alter table public.business_health_reports enable row level security;

-- Preserve the existing ConnectX and Zudo entitlement values while adding Business AI Health.
create or replace function public.apply_current_entitlement(p_license_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin
 select * into l from licenses where id=p_license_id;
 if not found then raise exception 'License not found'; end if;
 insert into current_entitlements(admin_id,current_license_id,shop_limit,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,business_health_enabled,business_health_daily_limit,status,starts_at,expires_at,updated_at)
 values(l.admin_id,l.id,l.max_stores,l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,l.business_health_enabled,l.business_health_daily_limit,'active',l.starts_at,l.expires_at,now())
 on conflict(admin_id) do update set current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,business_health_enabled=excluded.business_health_enabled,business_health_daily_limit=excluded.business_health_daily_limit,status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
 for r in select id from stores where admin_id=l.admin_id order by created_at asc loop
  n:=n+1;
  update stores set status=case when n<=l.max_stores then 'active'::store_status else 'read_only'::store_status end,updated_at=now() where id=r.id;
 end loop;
end $$;

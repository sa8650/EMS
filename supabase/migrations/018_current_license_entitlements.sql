-- Run after 017. Current entitlement controls capacity; license records remain permanent history.
-- The read_only enum value must already be committed. Run 018a_add_read_only_status.sql first.
alter table public.licenses add column if not exists transaction_type text not null default 'new' check(transaction_type in ('new','renewal','upgrade','downgrade'));
create table public.current_entitlements (
 admin_id uuid primary key references public.administrators(id) on delete cascade,
 current_license_id uuid references public.licenses(id) on delete set null,
 shop_limit integer not null default 0 check(shop_limit>=0),
 connectx_enabled boolean not null default false,
 connectx_daily_limit integer not null default 0 check(connectx_daily_limit>=0),
 status text not null default 'expired' check(status in ('active','expired')),
 starts_at timestamptz,
 expires_at timestamptz,
 updated_at timestamptz not null default now()
);
create index current_entitlements_status_idx on public.current_entitlements(status,expires_at);
revoke all on public.current_entitlements from anon,authenticated;
alter table public.current_entitlements enable row level security;

create or replace function public.apply_current_entitlement(p_license_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin
 select * into l from licenses where id=p_license_id;
 if not found then raise exception 'License not found'; end if;
 insert into current_entitlements(admin_id,current_license_id,shop_limit,connectx_enabled,connectx_daily_limit,status,starts_at,expires_at,updated_at)
 values(l.admin_id,l.id,l.max_stores,l.connectx_enabled,l.connectx_daily_limit,'active',l.starts_at,l.expires_at,now())
 on conflict(admin_id) do update set current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
 -- preserve ownership/data; only capacity determines active vs read-only, oldest shops retain active operation.
 for r in select id from stores where admin_id=l.admin_id order by created_at asc loop
  n:=n+1;
  update stores set status = case when n <= l.max_stores then 'active'::store_status else 'read_only'::store_status end, updated_at = now() where id = r.id;
 end loop;
end $$;
revoke all on function public.apply_current_entitlement(uuid) from public;
-- Initialize entitlement for existing active licenses during upgrade.
select public.apply_current_entitlement(id) from (select distinct on (admin_id) id from public.licenses where status='active' and starts_at<=now() and expires_at>now() order by admin_id,starts_at desc,created_at desc) q;

create or replace function public.factory_reset_ems()
returns void language plpgsql security definer set search_path=public as $$
begin
 truncate table public.platform_activity_logs,public.platform_settings,public.connectx_messages,public.connectx_settings,public.due_recoveries,public.current_entitlements,public.licenses,public.license_plans,public.administrators,public.ems_owners restart identity cascade;
 insert into public.platform_settings(setting_key,setting_value) values ('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1","public_base_url":""}'::jsonb);
end $$;
revoke all on function public.factory_reset_ems() from public;

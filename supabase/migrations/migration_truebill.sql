-- ============================================================================
-- EMS V1 · TrueBill premium feature — Supabase migration
-- Run this AFTER the add-ons migrations (031, 032) and business-health (027).
-- Idempotent (safe to run more than once).
-- ============================================================================

-- 1) Allow 'truebill' as an add-on key (the inline CHECK constraints are
--    auto-named {table}_{column}_check).
alter table public.addon_settings  drop constraint if exists addon_settings_addon_key_check;
alter table public.addon_settings  add constraint addon_settings_addon_key_check
  check(addon_key in ('connectx','zudo','business_health','truebill'));

alter table public.addon_purchases drop constraint if exists addon_purchases_addon_key_check;
alter table public.addon_purchases add constraint addon_purchases_addon_key_check
  check(addon_key in ('connectx','zudo','business_health','truebill'));

-- 2) Verification base URL for TrueBill (set in the Setup modal).
alter table public.addon_settings add column if not exists url text;

-- 3) Seed the TrueBill add-on card.
--    min/max daily limit are forced to 1 because TrueBill has NO daily limit;
--    the price formula is simply unit_price × days.
insert into public.addon_settings
  (addon_key, title, details, unit_price, min_days, max_days, min_daily_limit, max_daily_limit)
values
  ('truebill','TrueBill','Put a scannable QR code on every invoice so customers can verify authenticity.',
   2, 30, 365, 1, 1)
on conflict(addon_key) do nothing;

-- 4) TrueBill on license plans / licenses / entitlements (boolean, no daily limit).
alter table public.license_plans         add column if not exists truebill_enabled boolean not null default false;
alter table public.licenses              add column if not exists truebill_enabled boolean not null default false;
alter table public.current_entitlements  add column if not exists truebill_enabled boolean not null default false;

-- 5) Re-create apply_current_entitlement so TrueBill is carried into entitlements.
create or replace function public.apply_current_entitlement(p_license_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin
  select * into l from licenses where id=p_license_id;
  if not found then raise exception 'License not found'; end if;
  insert into current_entitlements(admin_id,current_license_id,shop_limit,
    connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,
    business_health_enabled,business_health_daily_limit,truebill_enabled,
    status,starts_at,expires_at,updated_at)
  values(l.admin_id,l.id,l.max_stores,
    l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,
    l.business_health_enabled,l.business_health_daily_limit,l.truebill_enabled,
    'active',l.starts_at,l.expires_at,now())
  on conflict(admin_id) do update set
    current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,
    connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,
    zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,
    business_health_enabled=excluded.business_health_enabled,business_health_daily_limit=excluded.business_health_daily_limit,
    truebill_enabled=excluded.truebill_enabled,
    status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
  for r in select id from stores where admin_id=l.admin_id order by created_at asc loop
    n:=n+1;
    update stores set status=case when n<=l.max_stores then 'active'::store_status else 'read_only'::store_status end,updated_at=now() where id=r.id;
  end loop;
end $$;

-- 6) Verification scan log (for the EMS Owner TrueBill page).
create table if not exists public.truebill_scans (
  id bigint generated always as identity primary key,
  store_id uuid references public.stores(id) on delete set null,
  invoice_id uuid,
  invoice_number text not null,
  invoice_kind text,
  scanned_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);
create index if not exists truebill_scans_scanned_idx on public.truebill_scans(scanned_at desc);
revoke all on public.truebill_scans from anon,authenticated;
alter table public.truebill_scans enable row level security;

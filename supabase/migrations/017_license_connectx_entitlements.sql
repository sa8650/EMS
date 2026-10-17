-- Run after 016. ConnectX is granted per license plan, per shop, until license expiry.
alter table public.license_plans add column if not exists connectx_enabled boolean not null default false;
alter table public.license_plans add column if not exists connectx_daily_limit integer not null default 0 check(connectx_daily_limit >= 0);
alter table public.licenses add column if not exists connectx_enabled boolean not null default false;
alter table public.licenses add column if not exists connectx_daily_limit integer not null default 0 check(connectx_daily_limit >= 0);
alter table public.connectx_settings drop column if exists default_shop_daily_limit;
create index if not exists licenses_connectx_active_idx on public.licenses(admin_id,status,connectx_enabled,starts_at,expires_at);

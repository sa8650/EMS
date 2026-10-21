create table if not exists public.addon_checkout_settings(id boolean primary key default true check(id),payment_info text not null default '',updated_by uuid references public.ems_owners(id),updated_at timestamptz not null default now());
insert into public.addon_checkout_settings(id) values(true) on conflict(id) do nothing;
create table if not exists public.addon_coupons(code text primary key,percent_off numeric(5,2) not null check(percent_off>0 and percent_off<=100),active boolean not null default true,expires_at timestamptz,created_at timestamptz not null default now());
revoke all on public.addon_checkout_settings,public.addon_coupons from anon,authenticated; alter table public.addon_checkout_settings enable row level security; alter table public.addon_coupons enable row level security;


-- Per-shop ConnectX email preferences. Apply after 063 before deploying the new code.
-- This does not modify the central sender, email history or SMS preferences.
create table if not exists public.connectx_shop_email_settings (
 store_id uuid primary key references public.stores(id) on delete cascade,
 enabled boolean not null default true,
 from_name text,
 from_email text,
 reply_to text,
 daily_limit integer check(daily_limit is null or daily_limit >= 0),
 updated_at timestamptz not null default now()
);
revoke all on public.connectx_shop_email_settings from anon, authenticated;

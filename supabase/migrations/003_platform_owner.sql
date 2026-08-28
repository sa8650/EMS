-- Run after 001 and 002. Creates the EMS platform-owner control plane.
create table public.ems_owners (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 2 and 120),
 email text not null unique check(email=lower(email)),
 password_hash text not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.administrators add column if not exists active boolean not null default true;
create or replace function public.enforce_single_ems_owner() returns trigger language plpgsql as $$ begin if exists(select 1 from public.ems_owners) then raise exception 'Only one EMS owner may be initialized'; end if; return new; end $$;
create trigger enforce_single_ems_owner before insert on public.ems_owners for each row execute function public.enforce_single_ems_owner();
create table public.platform_settings (
 setting_key text primary key,
 setting_value jsonb not null,
 updated_by uuid references public.ems_owners(id),
 updated_at timestamptz not null default now()
);
create table public.platform_activity_logs (
 id bigint generated always as identity primary key,
 owner_id uuid references public.ems_owners(id) on delete set null,
 action text not null,
 entity_type text,
 entity_id text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
insert into public.platform_settings(setting_key,setting_value) values
 ('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1"}'::jsonb)
on conflict (setting_key) do nothing;
create index on public.device_logins(store_id,last_seen_at desc);
create index on public.licenses(status,created_at desc);
revoke all on public.ems_owners,public.platform_settings,public.platform_activity_logs from anon,authenticated;
alter table public.ems_owners enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_activity_logs enable row level security;

-- Zudo V1: license-controlled, read-only Cloudflare Workers AI assistant.
alter table public.license_plans add column if not exists zudo_enabled boolean not null default false;
alter table public.license_plans add column if not exists zudo_daily_limit integer not null default 0 check(zudo_daily_limit>=0);
alter table public.licenses add column if not exists zudo_enabled boolean not null default false;
alter table public.licenses add column if not exists zudo_daily_limit integer not null default 0 check(zudo_daily_limit>=0);
alter table public.current_entitlements add column if not exists zudo_enabled boolean not null default false;
alter table public.current_entitlements add column if not exists zudo_daily_limit integer not null default 0 check(zudo_daily_limit>=0);
create table public.zudo_settings (id boolean primary key default true check(id), enabled boolean not null default false, model text not null default '@cf/meta/llama-3.1-8b-instruct', global_daily_limit integer not null default 500 check(global_daily_limit>0), updated_by uuid references public.ems_owners(id), updated_at timestamptz not null default now());
create table public.zudo_conversations (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, user_id uuid not null, title text not null default 'New conversation', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.zudo_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.zudo_conversations(id) on delete cascade, store_id uuid not null references public.stores(id) on delete cascade, user_id uuid not null, role text not null check(role in ('user','assistant')), content text not null, created_at timestamptz not null default now());
create index zudo_conversations_user_idx on public.zudo_conversations(store_id,user_id,updated_at desc);
create index zudo_messages_conversation_idx on public.zudo_messages(conversation_id,created_at);
revoke all on public.zudo_settings,public.zudo_conversations,public.zudo_messages from anon,authenticated;
alter table public.zudo_settings enable row level security;
alter table public.zudo_conversations enable row level security;
alter table public.zudo_messages enable row level security;

create or replace function public.apply_current_entitlement(p_license_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin select * into l from licenses where id=p_license_id; if not found then raise exception 'License not found'; end if;
insert into current_entitlements(admin_id,current_license_id,shop_limit,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,status,starts_at,expires_at,updated_at) values(l.admin_id,l.id,l.max_stores,l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,'active',l.starts_at,l.expires_at,now()) on conflict(admin_id) do update set current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
for r in select id from stores where admin_id=l.admin_id order by created_at asc loop n:=n+1; update stores set status=case when n<=l.max_stores then 'active'::store_status else 'read_only'::store_status end,updated_at=now() where id=r.id; end loop;
end $$;

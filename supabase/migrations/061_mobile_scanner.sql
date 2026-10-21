-- Mobile Scanner: temporary Pharmacy POS coordination only; no invoice/stock/report writes.
create table if not exists public.scanner_drafts (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 terminal_id uuid not null, pc_user_id uuid not null, status text not null default 'ready'
 check(status in ('ready','saving','closed','cancelled')),
 save_key uuid, created_at timestamptz not null default now(), expires_at timestamptz not null,
 last_seen timestamptz not null default now()
);
create index if not exists scanner_drafts_active on public.scanner_drafts(store_id, status, expires_at);
create table if not exists public.scanner_pairs (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 token_hash text not null unique, created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz
);
create table if not exists public.scanner_bindings (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 phone_user_id uuid not null, created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz
);
create index if not exists scanner_bindings_draft on public.scanner_bindings(draft_id);
create table if not exists public.scanner_events (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 binding_id uuid not null references public.scanner_bindings(id) on delete cascade,
 product_id uuid not null references public.pharmacy_products(id),
 status text not null default 'pending' check(status in ('pending','applied','rejected')),
 reason text, created_at timestamptz not null default now(), acknowledged_at timestamptz
);
create index if not exists scanner_events_draft on public.scanner_events(draft_id,status,created_at);
-- serialize enqueue and save barrier on the same draft row.
create or replace function public.scanner_enqueue(p_id uuid,p_store uuid,p_draft uuid,p_binding uuid,p_user uuid,p_product uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype; b public.scanner_bindings%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 select * into b from public.scanner_bindings where id=p_binding and draft_id=p_draft and store_id=p_store and phone_user_id=p_user and revoked_at is null and expires_at>now();
 if not found then return 'unbound'; end if;
 if not exists(select 1 from public.pharmacy_products where id=p_product and store_id=p_store and active=true) then return 'product'; end if;
 insert into public.scanner_events(id,store_id,draft_id,binding_id,product_id) values(p_id,p_store,p_draft,p_binding,p_product)
 on conflict(id) do nothing;
 return 'ok';
end $$;
create or replace function public.scanner_prepare(p_store uuid,p_draft uuid,p_pc uuid,p_key uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store and pc_user_id=p_pc for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 if exists(select 1 from public.scanner_events where draft_id=p_draft and status='pending') then return 'pending'; end if;
 update public.scanner_drafts set status='saving',save_key=p_key where id=p_draft;
 return 'ok';
end $$;
revoke all on public.scanner_drafts, public.scanner_pairs, public.scanner_bindings, public.scanner_events from anon, authenticated;
revoke all on function public.scanner_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.scanner_prepare(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.scanner_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_prepare(uuid,uuid,uuid,uuid) to service_role;

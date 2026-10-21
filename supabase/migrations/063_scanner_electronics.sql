-- Electronics scanner event queue and atomic retry-safe official invoice posting.
-- Apply AFTER 061 and 062. Pharmacy queue and official invoice workflow unchanged.
create table if not exists public.scanner_inventory_events (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 binding_id uuid not null references public.scanner_bindings(id) on delete cascade,
 product_id uuid not null references public.inventory_items(id),
 status text not null default 'pending' check(status in ('pending','applied','rejected')),
 reason text, created_at timestamptz not null default now(), acknowledged_at timestamptz
);
create index if not exists scanner_inventory_events_draft on public.scanner_inventory_events(draft_id,status,created_at);
create table if not exists public.scanner_invoice_saves (
 store_id uuid not null references public.stores(id) on delete cascade,
 operation_key uuid not null, kind text not null check(kind in ('sale','purchase')),
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 primary key(store_id,operation_key)
);
revoke all on public.scanner_inventory_events,public.scanner_invoice_saves from anon,authenticated;
create or replace function public.scanner_inventory_enqueue(p_id uuid,p_store uuid,p_draft uuid,p_binding uuid,p_user uuid,p_product uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype; b public.scanner_bindings%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 select * into b from public.scanner_bindings where id=p_binding and draft_id=p_draft and store_id=p_store and phone_user_id=p_user and revoked_at is null and expires_at>now();
 if not found then return 'unbound'; end if;
 if not exists(select 1 from public.inventory_items where id=p_product and store_id=p_store and active=true) then return 'product'; end if;
 insert into public.scanner_inventory_events(id,store_id,draft_id,binding_id,product_id) values(p_id,p_store,p_draft,p_binding,p_product)
 on conflict(id) do nothing;
 return 'ok';
end $$;
create or replace function public.scanner_inventory_prepare(p_store uuid,p_draft uuid,p_pc uuid,p_key uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store and pc_user_id=p_pc for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 if exists(select 1 from public.scanner_inventory_events where draft_id=p_draft and status='pending') then return 'pending'; end if;
 update public.scanner_drafts set status='saving',save_key=p_key where id=p_draft;
 return 'ok';
end $$;
-- Same invoice-saving RPC as Electronics uses today, wrapped in one DB transaction.
-- The advisory lock serializes concurrent retries before stock/invoice posting.
create or replace function public.scanner_post_invoice(
 p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,
 p_payment_method public.payment_method,p_transaction_id text,p_notes text,
 p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,
 p_lines jsonb,p_operation_key uuid)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices; v_stock record; v_available numeric;
begin
 if p_operation_key is null then raise exception 'Scanner save key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_operation_key::text,0));
 select i.* into v_invoice from public.scanner_invoice_saves s
 join public.invoices i on i.id=s.invoice_id and i.store_id=s.store_id
 where s.store_id=p_store_id and s.operation_key=p_operation_key;
 if found then
   if v_invoice.kind<>p_kind then raise exception 'Scanner key belongs to another invoice kind'; end if;
   return v_invoice;
 end if;
 -- Check the sum of duplicate item lines under inventory locks; the existing
 -- post_invoice RPC remains authoritative for invoice and stock posting.
 if p_kind='sale' then
  for v_stock in select (line->>'itemId')::uuid as item_id,sum((line->>'quantity')::numeric) as qty
    from jsonb_array_elements(p_lines) line group by (line->>'itemId')::uuid order by 1 loop
   select total_stock into v_available from public.inventory_items
     where id=v_stock.item_id and store_id=p_store_id for update;
   if not found or v_available<v_stock.qty then raise exception 'Insufficient stock for scanner invoice item'; end if;
  end loop;
 end if;
 v_invoice:=public.post_invoice(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,
   p_payment_method,p_transaction_id,p_notes,p_tax_percent,p_discount,p_paid_amount,p_created_by,p_lines);
 insert into public.scanner_invoice_saves(store_id,operation_key,kind,invoice_id)
 values(p_store_id,p_operation_key,p_kind,v_invoice.id);
 return v_invoice;
end $$;
revoke all on function public.scanner_inventory_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.scanner_inventory_prepare(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.scanner_post_invoice(uuid,text,text,uuid,date,public.payment_method,text,text,numeric,numeric,numeric,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.scanner_inventory_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_inventory_prepare(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_post_invoice(uuid,text,text,uuid,date,public.payment_method,text,text,numeric,numeric,numeric,uuid,jsonb,uuid) to service_role;

-- Legacy bill-pairing codes were retired in favor of one-use sign-in QR.
drop table if exists public.scanner_pairs;

-- EMS CShop: additive clothing business console support.
-- Existing shops stay Electronics by default; no existing inventory is rewritten.

alter table public.stores
  add column if not exists shop_type text not null default 'electronics';

-- Snapshot variant cost on each invoice line so historical profit reporting is stable.
alter table public.invoice_lines
  add column if not exists cost_price numeric(14,2);

-- Keep license reconciliation compatible with installations that did not run
-- the earlier unversioned Vaultium entitlement alteration.
alter table public.license_plans add column if not exists vaultium_gb integer not null default 0;
alter table public.licenses add column if not exists vaultium_gb integer not null default 0;
alter table public.current_entitlements add column if not exists vaultium_gb integer not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stores_shop_type_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_shop_type_check check (shop_type in ('electronics','clothing'));
  end if;
end $$;

create table if not exists public.clothing_products (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  name                text not null,
  style_code          text not null,
  category            text not null,
  brand               text,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  description         text,
  unit                text not null default 'pcs' check (unit in ('pcs','pair','set','dozen','meter','yard')),
  purchase_unit       text not null default 'pcs' check (purchase_unit in ('pcs','pair','set','dozen','meter','yard')),
  purchase_to_stock   numeric(14,4) not null default 1 check (purchase_to_stock > 0),
  cost_price          numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price          numeric(14,2) not null default 0 check (sale_price >= 0),
  reorder_threshold   numeric(14,3) not null default 0 check (reorder_threshold >= 0),
  images              jsonb not null default '[]'::jsonb,
  measurements        jsonb not null default '{}'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, style_code)
);
create index if not exists clothing_products_store_category_idx
  on public.clothing_products(store_id, category, name);

-- Each size/color combination owns one existing inventory_items row. That lets
-- EMS's current invoice, returns, exchanges, due, TrueBill and stock procedures
-- continue to operate on the precise variant without changing their contracts.
create table if not exists public.clothing_variants (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  product_id          uuid not null references public.clothing_products(id) on delete cascade,
  inventory_item_id   uuid not null unique references public.inventory_items(id) on delete restrict,
  size_label          text,
  size_system         text,
  color               text,
  variant_sku         text not null,
  barcode             text,
  cost_price          numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price          numeric(14,2) not null default 0 check (sale_price >= 0),
  reorder_threshold   numeric(14,3) not null default 0 check (reorder_threshold >= 0),
  measurements        jsonb not null default '{}'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, variant_sku)
);
create index if not exists clothing_variants_store_product_idx
  on public.clothing_variants(store_id, product_id, active);
create index if not exists clothing_variants_barcode_idx
  on public.clothing_variants(store_id, barcode) where barcode is not null;
create unique index if not exists clothing_variants_barcode_uq
  on public.clothing_variants(store_id, barcode) where barcode is not null and barcode <> '';
create unique index if not exists clothing_variants_matrix_uq
  on public.clothing_variants(
    product_id,
    coalesce(nullif(lower(trim(size_label)), ''), ''),
    coalesce(nullif(lower(trim(color)), ''), '')
  );

create table if not exists public.clothing_size_profiles (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  category        text not null,
  size_system     text not null default 'alpha',
  sizes           jsonb not null default '[]'::jsonb,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (store_id, category)
);

create table if not exists public.clothing_purchase_returns (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  return_number       text not null,
  return_date         date not null default current_date,
  total_return_amount numeric(14,2) not null default 0 check (total_return_amount >= 0),
  reason              text not null,
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  unique(store_id, return_number)
);
create index if not exists clothing_purchase_returns_invoice_idx
  on public.clothing_purchase_returns(store_id, purchase_invoice_id);

create table if not exists public.clothing_purchase_return_items (
  id                  uuid primary key default gen_random_uuid(),
  return_id           uuid not null references public.clothing_purchase_returns(id) on delete cascade,
  invoice_line_id     uuid not null references public.invoice_lines(id) on delete restrict,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  variant_id          uuid not null references public.clothing_variants(id) on delete restrict,
  quantity            numeric(14,3) not null check (quantity > 0),
  unit_cost           numeric(14,2) not null check (unit_cost >= 0),
  total_amount        numeric(14,2) not null check (total_amount >= 0),
  created_at          timestamptz not null default now()
);
create index if not exists clothing_purchase_return_items_invoice_line_idx
  on public.clothing_purchase_return_items(invoice_line_id);

create table if not exists public.clothing_stock_transfers (
  id                  uuid primary key default gen_random_uuid(),
  source_store_id     uuid not null references public.stores(id) on delete cascade,
  target_store_id     uuid not null references public.stores(id) on delete cascade,
  source_variant_id   uuid not null references public.clothing_variants(id) on delete restrict,
  target_variant_id   uuid not null references public.clothing_variants(id) on delete restrict,
  quantity            numeric(14,3) not null check (quantity > 0),
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  check (source_store_id <> target_store_id)
);
create index if not exists clothing_stock_transfers_source_idx
  on public.clothing_stock_transfers(source_store_id, created_at desc);
create index if not exists clothing_stock_transfers_target_idx
  on public.clothing_stock_transfers(target_store_id, created_at desc);

alter table public.clothing_products enable row level security;
alter table public.clothing_variants enable row level security;
alter table public.clothing_size_profiles enable row level security;
alter table public.clothing_purchase_returns enable row level security;
alter table public.clothing_purchase_return_items enable row level security;
alter table public.clothing_stock_transfers enable row level security;
grant all on public.clothing_products to service_role;
grant all on public.clothing_variants to service_role;
grant all on public.clothing_size_profiles to service_role;
grant all on public.clothing_purchase_returns to service_role;
grant all on public.clothing_purchase_return_items to service_role;
grant all on public.clothing_stock_transfers to service_role;

-- Reapply only a currently valid license. Expired or scheduled licenses must
-- not replace the present entitlement; inactive stores remain inactive.
create or replace function public.apply_current_entitlement(p_license_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin
  select * into l from public.licenses where id=p_license_id;
  if not found then raise exception 'License not found'; end if;
  if l.status <> 'active' or (l.starts_at is not null and l.starts_at > now()) or l.expires_at is null or l.expires_at <= now() then
    raise exception 'Only a currently valid active license can be applied';
  end if;
  insert into public.current_entitlements(
    admin_id,current_license_id,shop_limit,
    connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,
    business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb,
    status,starts_at,expires_at,updated_at)
  values(
    l.admin_id,l.id,l.max_stores,
    l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,
    l.business_health_enabled,l.business_health_daily_limit,l.truebill_enabled,l.vaultium_gb,
    'active',coalesce(l.starts_at,now()),l.expires_at,now())
  on conflict(admin_id) do update set
    current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,
    connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,
    zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,
    business_health_enabled=excluded.business_health_enabled,business_health_daily_limit=excluded.business_health_daily_limit,
    truebill_enabled=excluded.truebill_enabled,vaultium_gb=excluded.vaultium_gb,
    status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
  for r in select id,status from public.stores where admin_id=l.admin_id order by created_at asc,id asc loop
    n:=n+1;
    update public.stores set status=case
      when r.status='inactive' then 'inactive'::public.store_status
      when n<=l.max_stores then 'active'::public.store_status
      else 'read_only'::public.store_status end,
      updated_at=now() where id=r.id;
  end loop;
end $$;
revoke all on function public.apply_current_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.apply_current_entitlement(uuid) to service_role;

-- Atomic supplier returns validate prior returns and deduct stock in one transaction.
create or replace function public.cshop_post_purchase_return(
  p_store_id uuid,
  p_invoice_id uuid,
  p_return_number text,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices;
  v_request record;
  v_line record;
  v_return_id uuid;
  v_total numeric(14,2):=0;
  v_quantity numeric(14,3);
  v_returned numeric(14,3);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_line_total numeric(14,2);
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Select at least one purchase line to return';
  end if;
  if nullif(trim(p_return_number),'') is null or nullif(trim(p_reason),'') is null then
    raise exception 'Return number and reason are required';
  end if;
  select * into v_invoice from public.invoices
    where id=p_invoice_id and store_id=p_store_id and kind='purchase' for update;
  if not found then raise exception 'Purchase invoice does not belong to this shop'; end if;

  -- Validate every line and its unreturned quantity before writing any stock.
  for v_request in
    select invoice_line_id, sum(quantity)::numeric as quantity
      from jsonb_to_recordset(p_items) as x(invoice_line_id uuid, quantity numeric)
     group by invoice_line_id order by invoice_line_id
  loop
    if v_request.quantity<=0 then raise exception 'Return quantities must be positive'; end if;
    select il.id,il.item_id,il.quantity as purchased,il.unit_price,i.total_stock,cv.id as variant_id
      into v_line
      from public.invoice_lines il
      join public.inventory_items i on i.id=il.item_id and i.store_id=p_store_id
      join public.clothing_variants cv on cv.inventory_item_id=i.id and cv.store_id=p_store_id
     where il.id=v_request.invoice_line_id and il.invoice_id=p_invoice_id
     for update of i;
    if not found then raise exception 'Purchase line is not a Clothing variant in this shop'; end if;
    select coalesce(sum(ri.quantity),0) into v_returned
      from public.clothing_purchase_return_items ri
      join public.clothing_purchase_returns r on r.id=ri.return_id
     where r.store_id=p_store_id and ri.invoice_line_id=v_line.id;
    if v_request.quantity>v_line.purchased-v_returned then
      raise exception 'Return quantity exceeds the unreturned quantity on the purchase invoice';
    end if;
    if v_request.quantity>v_line.total_stock then
      raise exception 'Insufficient variant stock to return to the supplier';
    end if;
    v_total:=v_total+round(v_request.quantity*v_line.unit_price,2);
  end loop;

  v_return_id:=gen_random_uuid();
  insert into public.clothing_purchase_returns(
    id,store_id,purchase_invoice_id,supplier_id,return_number,return_date,total_return_amount,reason,notes,created_by
  ) values (
    v_return_id,p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,coalesce(p_return_date,current_date),
    v_total,trim(p_reason),nullif(trim(p_notes),''),p_created_by
  );

  for v_request in
    select invoice_line_id, sum(quantity)::numeric as quantity
      from jsonb_to_recordset(p_items) as x(invoice_line_id uuid, quantity numeric)
     group by invoice_line_id order by invoice_line_id
  loop
    v_quantity:=v_request.quantity;
    select il.id,il.item_id,il.unit_price,cv.id as variant_id,i.total_stock
      into v_line
      from public.invoice_lines il
      join public.inventory_items i on i.id=il.item_id and i.store_id=p_store_id
      join public.clothing_variants cv on cv.inventory_item_id=i.id and cv.store_id=p_store_id
     where il.id=v_request.invoice_line_id and il.invoice_id=p_invoice_id
     for update of i;
    v_before:=v_line.total_stock;
    v_after:=v_before-v_quantity;
    v_line_total:=round(v_quantity*v_line.unit_price,2);
    update public.inventory_items set total_stock=v_after,updated_at=now()
      where id=v_line.item_id and store_id=p_store_id;
    insert into public.clothing_purchase_return_items(
      return_id,invoice_line_id,item_id,variant_id,quantity,unit_cost,total_amount
    ) values (
      v_return_id,v_line.id,v_line.item_id,v_line.variant_id,v_quantity,v_line.unit_price,v_line_total
    );
    insert into public.inventory_stock_movements(
      store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by
    ) values (
      p_store_id,v_line.item_id,'purchase_return',v_quantity,v_before,v_after,'returned_to_supplier',
      'Purchase return '||p_return_number||': '||trim(p_reason),p_created_by
    );
  end loop;
  update public.invoices
    set total_due=greatest(total_due-v_total,0),updated_at=now()
    where id=p_invoice_id and store_id=p_store_id;
  return jsonb_build_object('id',v_return_id,'store_id',p_store_id,'purchase_invoice_id',p_invoice_id,
    'return_number',p_return_number,'return_date',coalesce(p_return_date,current_date),
    'total_return_amount',v_total,'reason',trim(p_reason),'notes',nullif(trim(p_notes),''));
end $$;

-- Atomic stock controls are the only clothing paths that mutate on-hand stock.
create or replace function public.cshop_adjust_stock(
  p_store_id uuid,
  p_item_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_condition text,
  p_notes text,
  p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_item public.inventory_items; v_before numeric(14,3); v_after numeric(14,3);
begin
  if p_delta = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if p_movement_type not in ('adjustment','damaged','reconciliation','purchase_return','opening') then
    raise exception 'Invalid stock movement type';
  end if;
  select i.* into v_item
    from public.inventory_items i
    join public.clothing_variants v on v.inventory_item_id=i.id and v.store_id=p_store_id
    where i.id=p_item_id and i.store_id=p_store_id
    for update of i;
  if not found then raise exception 'Clothing variant does not belong to this shop'; end if;
  v_before:=v_item.total_stock;
  v_after:=v_before+p_delta;
  if v_after < 0 then raise exception 'This adjustment would make stock negative'; end if;
  update public.inventory_items
    set total_stock=v_after, updated_at=now()
    where id=p_item_id and store_id=p_store_id;
  insert into public.inventory_stock_movements(
    store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by
  ) values (
    p_store_id,p_item_id,p_movement_type,abs(p_delta),v_before,v_after,
    coalesce(nullif(p_condition,''),'good'),nullif(p_notes,''),p_created_by
  );
  return jsonb_build_object('item_id',p_item_id,'stock_before',v_before,'stock_after',v_after,'delta',p_delta);
end $$;

drop function if exists public.cshop_transfer_stock(uuid,uuid,uuid,uuid,numeric,text,uuid);

create or replace function public.cshop_transfer_stock(
  p_source_store_id uuid,
  p_source_item_id uuid,
  p_source_variant_id uuid,
  p_target_store_id uuid,
  p_target_item_id uuid,
  p_target_variant_id uuid,
  p_quantity numeric,
  p_notes text,
  p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_source public.inventory_items; v_target public.inventory_items; v_source_before numeric(14,3); v_target_before numeric(14,3);
begin
  if p_source_store_id=p_target_store_id or p_quantity<=0 then raise exception 'Choose a different target shop and a positive quantity'; end if;
  if not exists (
    select 1 from public.stores a join public.stores b on a.admin_id=b.admin_id
    where a.id=p_source_store_id and b.id=p_target_store_id
      and a.shop_type='clothing' and b.shop_type='clothing'
  ) then raise exception 'Stock can only move between Clothing shops owned by the same administrator'; end if;
  perform id from public.inventory_items
    where id in (p_source_item_id,p_target_item_id)
    order by id for update;
  select * into v_source from public.inventory_items
    where id=p_source_item_id and store_id=p_source_store_id;
  select * into v_target from public.inventory_items
    where id=p_target_item_id and store_id=p_target_store_id;
  if v_source.id is null or v_target.id is null then raise exception 'Source or target variant was not found'; end if;
  if not exists(select 1 from public.clothing_variants where id=p_source_variant_id and store_id=p_source_store_id and inventory_item_id=p_source_item_id and active)
     or not exists(select 1 from public.clothing_variants where id=p_target_variant_id and store_id=p_target_store_id and inventory_item_id=p_target_item_id and active) then
    raise exception 'Source and target must be active matching Clothing variants';
  end if;
  v_source_before:=v_source.total_stock; v_target_before:=v_target.total_stock;
  if v_source_before<p_quantity then raise exception 'Insufficient stock for transfer'; end if;
  update public.inventory_items set total_stock=total_stock-p_quantity,updated_at=now() where id=p_source_item_id;
  update public.inventory_items set total_stock=total_stock+p_quantity,updated_at=now() where id=p_target_item_id;
  insert into public.inventory_stock_movements(store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by)
  values(p_source_store_id,p_source_item_id,'transfer_out',p_quantity,v_source_before,v_source_before-p_quantity,'transferred',p_notes,p_created_by),
        (p_target_store_id,p_target_item_id,'transfer_in',p_quantity,v_target_before,v_target_before+p_quantity,'transferred',p_notes,p_created_by);
  insert into public.clothing_stock_transfers(source_store_id,target_store_id,source_variant_id,target_variant_id,quantity,notes,created_by)
  select p_source_store_id,p_target_store_id,sv.id,tv.id,p_quantity,nullif(p_notes,''),p_created_by
    from public.clothing_variants sv,public.clothing_variants tv
    where sv.inventory_item_id=p_source_item_id and sv.store_id=p_source_store_id
      and tv.inventory_item_id=p_target_item_id and tv.store_id=p_target_store_id;
  return jsonb_build_object('quantity',p_quantity,'source_stock',v_source_before-p_quantity,'target_stock',v_target_before+p_quantity);
end $$;

revoke all on function public.cshop_post_purchase_return(uuid,uuid,text,date,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.cshop_adjust_stock(uuid,uuid,numeric,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.cshop_transfer_stock(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid) from public, anon, authenticated;
grant execute on function public.cshop_post_purchase_return(uuid,uuid,text,date,text,text,uuid,jsonb) to service_role;
grant execute on function public.cshop_adjust_stock(uuid,uuid,numeric,text,text,text,uuid) to service_role;
grant execute on function public.cshop_transfer_stock(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid) to service_role;

notify pgrst, 'reload schema';

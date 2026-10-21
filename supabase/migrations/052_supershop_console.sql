-- EMS Supershop retail console. Additive, tenant-scoped and backward-compatible.
-- Shop category remains untouched; Pharmacy retains its legacy shop_type mapping.
begin;

alter table public.stores drop constraint if exists stores_shop_type_check;
alter table public.stores add constraint stores_shop_type_check
  check (shop_type in ('electronics','clothing','pharmacy','supershop'));
alter table public.stores drop constraint if exists stores_business_type_check;
alter table public.stores add constraint stores_business_type_check
  check (business_type in ('electronics','clothing','pharmacy','supershop'));
update public.stores set business_type='supershop' where shop_type='supershop' and business_type<>'supershop';

create table if not exists public.supershop_products (
  inventory_item_id uuid primary key references public.inventory_items(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete cascade,
  barcode text,
  brand text,
  subcategory text,
  description text,
  default_supplier_id uuid references public.suppliers(id) on delete set null,
  mrp_per_base numeric(14,4) not null default 0 check (mrp_per_base >= 0),
  tax_percent numeric(7,3) not null default 0 check (tax_percent >= 0),
  reorder_threshold numeric(14,3) not null default 5 check (reorder_threshold >= 0),
  average_cost_base numeric(14,6) not null default 0 check (average_cost_base >= 0),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, inventory_item_id)
);
create index if not exists supershop_products_store_active_idx on public.supershop_products(store_id,active);
create index if not exists supershop_products_supplier_idx on public.supershop_products(store_id,default_supplier_id);
create unique index if not exists supershop_products_barcode_uq
  on public.supershop_products(store_id,lower(barcode)) where barcode is not null and btrim(barcode)<>'';

create table if not exists public.supershop_product_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null references public.supershop_products(inventory_item_id) on delete cascade,
  unit_label text not null,
  factor_to_base numeric(16,6) not null check (factor_to_base > 0),
  allow_fractional boolean not null default false,
  can_purchase boolean not null default true,
  can_sell boolean not null default true,
  purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  selling_price numeric(14,2) check (selling_price is null or selling_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_item_id,unit_label)
);
create index if not exists supershop_units_store_product_idx on public.supershop_product_units(store_id,inventory_item_id);

create table if not exists public.supershop_invoice_lines (
  invoice_line_id uuid primary key references public.invoice_lines(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  unit_label text not null,
  unit_factor numeric(16,6) not null check (unit_factor > 0),
  quantity_base numeric(16,3) not null check (quantity_base > 0),
  free_quantity_base numeric(16,3) not null default 0 check (free_quantity_base >= 0),
  unit_cost_base numeric(16,6) not null default 0 check (unit_cost_base >= 0),
  mrp_per_base numeric(14,4) not null default 0 check (mrp_per_base >= 0),
  created_at timestamptz not null default now()
);
create index if not exists supershop_invoice_lines_store_item_idx on public.supershop_invoice_lines(store_id,inventory_item_id);

create table if not exists public.supershop_stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','purchase','sale','adjustment','stock_count','return_restock','return_damaged','return_defective','supplier_return','exchange_in','exchange_out','waste','damage')),
  quantity_base numeric(16,3) not null,
  stock_before numeric(16,3),
  stock_after numeric(16,3),
  unit_cost_base numeric(16,6) not null default 0,
  reference_type text,
  reference_id uuid,
  reason text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists supershop_movements_store_date_idx on public.supershop_stock_movements(store_id,created_at desc);
create index if not exists supershop_movements_item_date_idx on public.supershop_stock_movements(store_id,inventory_item_id,created_at desc);
create unique index if not exists supershop_movements_idempotency_uq on public.supershop_stock_movements(store_id,idempotency_key) where idempotency_key is not null;

create table if not exists public.supershop_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  operation_key text not null,
  operation_type text not null,
  result_id uuid,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,operation_key)
);
create index if not exists supershop_operations_invoice_idx on public.supershop_operations(store_id,invoice_id);

create table if not exists public.supershop_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  alert_key text not null,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  title text not null,
  detail text not null,
  status text not null default 'unread' check (status in ('unread','read','resolved')),
  href text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,alert_key)
);
create index if not exists supershop_alerts_store_status_idx on public.supershop_alerts(store_id,status,updated_at desc);

create table if not exists public.supershop_supplier_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  return_number text not null,
  return_date date not null default current_date,
  total_return_amount numeric(14,2) not null default 0 check (total_return_amount >= 0),
  due_reduction numeric(14,2) not null default 0 check (due_reduction >= 0),
  supplier_credit numeric(14,2) not null default 0 check (supplier_credit >= 0),
  reason text not null,
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,return_number),
  unique(store_id,idempotency_key)
);
create index if not exists supershop_supplier_returns_invoice_idx on public.supershop_supplier_returns(store_id,purchase_invoice_id,return_date desc);

create table if not exists public.supershop_supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supershop_supplier_returns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  quantity_base numeric(16,3) not null check (quantity_base > 0),
  free_quantity_base numeric(16,3) not null default 0 check (free_quantity_base >= 0),
  unit_label text not null,
  unit_factor numeric(16,6) not null check (unit_factor > 0),
  unit_cost_base numeric(16,6) not null default 0,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists supershop_supplier_return_items_return_idx on public.supershop_supplier_return_items(return_id);

create table if not exists public.supershop_exchange_lines (
  exchange_item_id uuid primary key references public.exchange_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  unit_label text not null,
  unit_factor numeric(16,6) not null check (unit_factor > 0),
  quantity_base numeric(16,3) not null check (quantity_base > 0),
  unit_cost_base numeric(16,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists supershop_exchange_lines_store_item_idx on public.supershop_exchange_lines(store_id,inventory_item_id);

create table if not exists public.supershop_exchange_settlements (
  exchange_id uuid primary key references public.exchanges(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  due_reduction numeric(14,2) not null default 0 check(due_reduction>=0),
  payment_received numeric(14,2) not null default 0 check(payment_received>=0),
  refund_paid numeric(14,2) not null default 0 check(refund_paid>=0),
  created_at timestamptz not null default now()
);

-- Protect Supershop aggregate stock from underflow even if a caller races the UI.
create or replace function public.supershop_guard_nonnegative_stock() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.total_stock < 0 and exists(select 1 from public.stores s where s.id=new.store_id and s.business_type='supershop') then
    raise exception 'supershop_stock_underflow';
  end if;
  return new;
end $$;
drop trigger if exists supershop_stock_underflow_guard on public.inventory_items;
create trigger supershop_stock_underflow_guard before update of total_stock on public.inventory_items
for each row execute function public.supershop_guard_nonnegative_stock();

-- A sale line may be refunded/exchanged at most once for the quantity originally sold.
-- The function derives store scope from the parent rows, so it also covers rows inserted outside EMS RPCs.
create or replace function public.supershop_guard_return_quantity_parent() returns trigger
language plpgsql set search_path=public as $$
declare v_store uuid; v_sold numeric; v_already numeric;
begin
  if new.invoice_line_id is null then return new; end if;
  if tg_table_name='return_items' then select store_id into v_store from public.returns where id=new.return_id;
  else select store_id into v_store from public.exchanges where id=new.exchange_id;
  end if;
  select il.quantity into v_sold from public.supershop_invoice_lines sl join public.invoice_lines il on il.id=sl.invoice_line_id
    where sl.invoice_line_id=new.invoice_line_id and sl.store_id=v_store;
  if v_sold is null then return new; end if;
  select coalesce(sum(x.quantity),0) into v_already from (
    select ri.quantity from public.return_items ri join public.returns r on r.id=ri.return_id
      where ri.invoice_line_id=new.invoice_line_id and r.store_id=v_store
    union all
    select ei.quantity from public.exchange_items ei join public.exchanges e on e.id=ei.exchange_id
      where ei.invoice_line_id=new.invoice_line_id and e.store_id=v_store and ei.item_type='returned'
  ) x;
  if v_already+new.quantity>v_sold+0.0001 then raise exception 'supershop_return_quantity_exceeded'; end if;
  return new;
end $$;
drop trigger if exists supershop_return_quantity_guard on public.return_items;
create trigger supershop_return_quantity_guard before insert on public.return_items
for each row execute function public.supershop_guard_return_quantity_parent();
drop trigger if exists supershop_exchange_quantity_guard on public.exchange_items;
create trigger supershop_exchange_quantity_guard before insert on public.exchange_items
for each row when (new.item_type='returned') execute function public.supershop_guard_return_quantity_parent();

-- Supplier returns are likewise bounded by the quantity received on the source line.
create or replace function public.supershop_guard_supplier_return_quantity() returns trigger
language plpgsql set search_path=public as $$
declare v_store uuid; v_received numeric; v_already numeric;
begin
  select store_id into v_store from public.supershop_supplier_returns where id=new.return_id;
  select quantity_base into v_received from public.supershop_invoice_lines where invoice_line_id=new.invoice_line_id and store_id=v_store;
  if v_received is null then raise exception 'supershop_purchase_line_missing'; end if;
  select coalesce(sum(quantity_base),0) into v_already from public.supershop_supplier_return_items ri
    join public.supershop_supplier_returns r on r.id=ri.return_id where ri.invoice_line_id=new.invoice_line_id and r.store_id=v_store;
  if v_already+new.quantity_base>v_received+0.0001 then raise exception 'supershop_supplier_return_quantity_exceeded'; end if;
  return new;
end $$;
drop trigger if exists supershop_supplier_return_quantity_guard on public.supershop_supplier_return_items;
create trigger supershop_supplier_return_quantity_guard before insert on public.supershop_supplier_return_items
for each row execute function public.supershop_guard_supplier_return_quantity();

create or replace function public.supershop_save_product(
  p_store_id uuid,p_product_id uuid,p_product jsonb,p_units jsonb,p_created_by uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid; v_item public.inventory_items%rowtype; v_meta public.supershop_products%rowtype;
  v_name text:=left(btrim(coalesce(p_product->>'name','')),180);
  v_base text:=left(lower(btrim(coalesce(p_product->>'base_unit','piece'))),60);
  v_sku text; v_barcode text; v_supplier uuid; v_stock numeric(14,3); v_purchase numeric(14,2); v_sale numeric(14,2);
  v_mrp numeric(14,4); v_tax numeric(7,3); v_reorder numeric(14,3); v_raw jsonb; v_label text; v_factor numeric(16,6);
  v_seen text[]:=array[]::text[]; v_initial numeric(14,3); v_unit_purchase numeric(14,2); v_unit_sale numeric(14,2);
begin
  if not exists(select 1 from public.stores where id=p_store_id and business_type='supershop') then raise exception 'Supershop shop not found'; end if;
  if v_name='' then raise exception 'Product name is required'; end if;
  if jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)<1 or jsonb_array_length(p_units)>50 then raise exception 'Add between 1 and 50 product units'; end if;
  v_sku:=nullif(left(btrim(coalesce(p_product->>'sku','')),80),'');
  v_barcode:=nullif(left(btrim(coalesce(p_product->>'barcode','')),80),'');
  v_supplier:=nullif(p_product->>'default_supplier_id','')::uuid;
  if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and store_id=p_store_id) then raise exception 'Supplier must belong to this shop'; end if;
  v_purchase:=greatest(0,coalesce(nullif(p_product->>'purchase_price','')::numeric,0));
  v_sale:=greatest(0,coalesce(nullif(p_product->>'sale_price','')::numeric,0));
  v_mrp:=greatest(0,coalesce(nullif(p_product->>'mrp_per_base','')::numeric,v_sale));
  v_tax:=greatest(0,coalesce(nullif(p_product->>'tax_percent','')::numeric,0));
  v_reorder:=greatest(0,coalesce(nullif(p_product->>'reorder_threshold','')::numeric,5));
  v_initial:=greatest(0,coalesce(nullif(p_product->>'initial_stock','')::numeric,0));
  if v_purchase>999999999 or v_sale>999999999 or v_mrp>999999999 or v_tax>100 or v_reorder>999999999 or v_initial>999999999 then raise exception 'Product pricing or stock value is outside the supported range'; end if;
  if p_product_id is null then
    v_id:=gen_random_uuid();
    if v_sku is null then v_sku:='ITM-'||lpad(nextval('public.inventory_code_seq')::text,7,'0'); end if;
    insert into public.inventory_items(id,store_id,item_code,description,unit,sale_price,total_stock,active,category,created_at,updated_at)
      values(v_id,p_store_id,v_sku,v_name,v_base,v_sale,round(v_initial,3),coalesce((p_product->>'active')::boolean,true),nullif(left(btrim(coalesce(p_product->>'category','')),100),''),now(),now());
    insert into public.supershop_products(inventory_item_id,store_id,barcode,brand,subcategory,description,default_supplier_id,mrp_per_base,tax_percent,reorder_threshold,average_cost_base,active,created_by,created_at,updated_at)
      values(v_id,p_store_id,v_barcode,nullif(left(btrim(coalesce(p_product->>'brand','')),120),''),nullif(left(btrim(coalesce(p_product->>'subcategory','')),100),''),nullif(left(btrim(coalesce(p_product->>'description','')),2000),''),v_supplier,v_mrp,v_tax,v_reorder,v_purchase,coalesce((p_product->>'active')::boolean,true),p_created_by,now(),now());
    if v_initial>0 then
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reason,idempotency_key,created_by)
      values(p_store_id,v_id,'opening',round(v_initial,3),0,round(v_initial,3),v_purchase,'product','Opening stock',null,p_created_by);
    end if;
  else
    v_id:=p_product_id;
    select * into v_item from public.inventory_items where id=v_id and store_id=p_store_id for update;
    if not found then raise exception 'Product was not found in this shop'; end if;
    select * into v_meta from public.supershop_products where inventory_item_id=v_id and store_id=p_store_id for update;
    if not found then raise exception 'Supershop product record was not found'; end if;
    if v_base<>lower(v_item.unit) and (v_item.total_stock<>0 or exists(select 1 from public.supershop_invoice_lines where inventory_item_id=v_id)) then
      raise exception 'Base unit cannot change after stock or transaction history exists';
    end if;
    if v_sku is null then v_sku:=v_item.item_code; end if;
    update public.inventory_items set item_code=v_sku,description=v_name,unit=v_base,sale_price=v_sale,
      category=nullif(left(btrim(coalesce(p_product->>'category','')),100),''),active=coalesce((p_product->>'active')::boolean,true),updated_at=now()
      where id=v_id and store_id=p_store_id;
    update public.supershop_products set barcode=v_barcode,brand=nullif(left(btrim(coalesce(p_product->>'brand','')),120),''),
      subcategory=nullif(left(btrim(coalesce(p_product->>'subcategory','')),100),''),description=nullif(left(btrim(coalesce(p_product->>'description','')),2000),''),
      default_supplier_id=v_supplier,mrp_per_base=v_mrp,tax_percent=v_tax,reorder_threshold=v_reorder,
      average_cost_base=case when v_item.total_stock=0 then v_purchase else average_cost_base end,
      active=coalesce((p_product->>'active')::boolean,true),updated_at=now()
      where inventory_item_id=v_id and store_id=p_store_id;
  end if;
  for v_raw in select value from jsonb_array_elements(p_units) loop
    v_label:=left(lower(btrim(coalesce(v_raw->>'unit_label',''))),60);
    v_factor:=coalesce(nullif(v_raw->>'factor_to_base','')::numeric,0);
    if v_label='' or v_factor<=0 or v_factor>1000000000 then raise exception 'Unit labels and conversion factors must be valid'; end if;
    if v_label=any(v_seen) then raise exception 'Unit labels must be unique'; end if;
    v_seen:=array_append(v_seen,v_label);
    if v_label=v_base and v_factor<>1 then raise exception 'Base unit conversion must equal 1'; end if;
    v_unit_purchase:=nullif(v_raw->>'purchase_price','')::numeric;
    v_unit_sale:=nullif(v_raw->>'selling_price','')::numeric;
    if coalesce(v_unit_purchase,0)<0 or coalesce(v_unit_sale,0)<0 then raise exception 'Unit prices cannot be negative'; end if;
    insert into public.supershop_product_units(store_id,inventory_item_id,unit_label,factor_to_base,allow_fractional,can_purchase,can_sell,purchase_price,selling_price,created_at,updated_at)
    values(p_store_id,v_id,v_label,v_factor,coalesce((v_raw->>'allow_fractional')::boolean,false),coalesce((v_raw->>'can_purchase')::boolean,true),coalesce((v_raw->>'can_sell')::boolean,true),v_unit_purchase,v_unit_sale,now(),now())
    on conflict(inventory_item_id,unit_label) do update set factor_to_base=excluded.factor_to_base,allow_fractional=excluded.allow_fractional,
      can_purchase=excluded.can_purchase,can_sell=excluded.can_sell,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,updated_at=now();
  end loop;
  if not (v_base=any(v_seen)) then raise exception 'The base unit must be included with a conversion factor of 1'; end if;
  delete from public.supershop_product_units where inventory_item_id=v_id and store_id=p_store_id and not (unit_label=any(v_seen));
  return v_id;
end $$;

create or replace function public.supershop_post_invoice(
  p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method text,p_transaction_id text,p_notes text,
  p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb,p_idempotency_key text,
  p_custom_party_name text default null,p_custom_party_address text default null,p_custom_party_phone text default null,p_allow_price_override boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_old public.invoices%rowtype; v_invoice public.invoices%rowtype; v_raw jsonb; v_lines jsonb:='[]'::jsonb; v_stock_left jsonb:='{}'::jsonb; v_item record; v_unit record;
  v_item_id uuid; v_unit_label text; v_qty numeric(14,3); v_free numeric(14,3); v_factor numeric(16,6); v_base numeric(16,3); v_free_base numeric(16,3);
  v_price numeric(14,2); v_tax_pct numeric(7,3); v_disc numeric(14,2); v_sub numeric(14,2); v_line_tax numeric(14,2); v_line_total numeric(14,2);
  v_subtotal numeric(14,2):=0; v_line_tax_sum numeric(14,2):=0; v_line_disc_sum numeric(14,2):=0;
  v_tax numeric(14,2); v_discount numeric(14,2); v_paid numeric(14,2); v_total numeric(14,2); v_global_alloc numeric(14,2);
  v_total_sub numeric(14,2); v_total_tax numeric(14,2); v_total_disc numeric(14,2); v_avg numeric(16,6); v_cost_base numeric(16,6);
  v_stock numeric(16,3); v_key text; v_now timestamptz:=now(); v_invoice_id uuid:=gen_random_uuid(); v_line_id uuid;
  v_payment_method public.payment_method; v_party_store uuid; v_party_name text;
begin
  if not exists(select 1 from public.stores where id=p_store_id and business_type='supershop' and status<>'inactive') then raise exception 'Supershop shop not found'; end if;
  if p_kind not in ('sale','purchase') or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>200 then raise exception 'Invoice type and 1–200 lines are required'; end if;
  if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>160 then raise exception 'A valid idempotency key is required'; end if;
  select i.* into v_old from public.supershop_operations o join public.invoices i on i.id=o.invoice_id where o.store_id=p_store_id and o.operation_key=p_idempotency_key limit 1;
  if found then return to_jsonb(v_old)||jsonb_build_object('idempotent',true); end if;
  if p_kind='sale' and p_party_id is not null then
    select store_id into v_party_store from public.customers where id=p_party_id;
    if v_party_store is distinct from p_store_id then raise exception 'Customer must belong to this shop'; end if;
  elsif p_kind='purchase' and p_party_id is not null then
    select store_id into v_party_store from public.suppliers where id=p_party_id;
    if v_party_store is distinct from p_store_id then raise exception 'Supplier must belong to this shop'; end if;
  end if;
  v_payment_method:=coalesce(nullif(lower(p_payment_method),''),'cash')::public.payment_method;
  v_tax:=round(coalesce(p_tax_percent,0),3); v_discount:=round(coalesce(p_discount,0),2); v_paid:=round(coalesce(p_paid_amount,0),2);
  if v_tax<0 or v_tax>100 or v_discount<0 or v_paid<0 then raise exception 'Invoice tax, discount, or payment is invalid'; end if;
  for v_raw in select value from jsonb_array_elements(p_lines) loop
    v_item_id:=nullif(v_raw->>'productId','')::uuid;
    v_unit_label:=left(lower(btrim(coalesce(v_raw->>'unitLabel',''))),60);
    v_qty:=round(coalesce(nullif(v_raw->>'quantity','')::numeric,0),3);
    v_free:=round(coalesce(nullif(v_raw->>'freeQuantity','')::numeric,0),3);
    if v_item_id is null or v_unit_label='' or v_qty<=0 or v_free<0 then raise exception 'Each invoice line needs a product, unit, positive quantity, and non-negative free quantity'; end if;
    select i.*,sp.average_cost_base,sp.mrp_per_base,sp.tax_percent as product_tax,sp.active as product_active
      into v_item from public.inventory_items i join public.supershop_products sp on sp.inventory_item_id=i.id and sp.store_id=i.store_id
      where i.id=v_item_id and i.store_id=p_store_id for update of i,sp;
    if not found or not v_item.active or not v_item.product_active then raise exception 'Product is inactive or not in this shop'; end if;
    select * into v_unit from public.supershop_product_units u where u.store_id=p_store_id and u.inventory_item_id=v_item_id and lower(u.unit_label)=v_unit_label;
    if not found or (p_kind='sale' and not v_unit.can_sell) or (p_kind='purchase' and not v_unit.can_purchase) then raise exception 'Unit is not enabled for this transaction'; end if;
    if not v_unit.allow_fractional and v_qty<>trunc(v_qty) then raise exception 'This unit does not allow decimal quantities'; end if;
    if v_free>0 and p_kind<>'purchase' then raise exception 'Free quantities are only valid on purchases'; end if;
    v_factor:=v_unit.factor_to_base; v_base:=round(v_qty*v_factor,3); v_free_base:=round(v_free*v_factor,3);
    if v_base<=0 then raise exception 'Quantity is below the smallest supported stock increment'; end if;
    if p_kind='purchase' then
      v_price:=round(coalesce(nullif(v_raw->>'unitPrice','')::numeric,v_unit.purchase_price,0),2);
    elsif p_allow_price_override then
      v_price:=round(coalesce(nullif(v_raw->>'unitPrice','')::numeric,v_unit.selling_price,v_item.sale_price*v_factor),2);
    else
      v_price:=round(coalesce(v_unit.selling_price,v_item.sale_price*v_factor),2);
    end if;
    v_tax_pct:=round(coalesce(nullif(v_raw->>'taxPercent','')::numeric,v_item.product_tax,0),3);
    v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    if v_price<0 or v_tax_pct<0 or v_tax_pct>100 or v_disc<0 then raise exception 'Line price, tax, or discount is invalid'; end if;
    v_sub:=round(v_qty*v_price,2); v_line_tax:=round(v_sub*v_tax_pct/100,2);
    if v_disc>v_sub+v_line_tax then raise exception 'Line discount cannot exceed line total'; end if;
    v_line_total:=round(v_sub+v_line_tax-v_disc,2);
    if p_kind='sale' then
      v_key:=v_item_id::text;
      if v_stock_left ? v_key then v_stock:=coalesce((v_stock_left->>v_key)::numeric,0); else v_stock:=v_item.total_stock; end if;
      if v_stock<v_base then raise exception 'Insufficient stock for %; available % %',v_item.description,v_stock,v_item.unit; end if;
      v_stock_left:=v_stock_left||jsonb_build_object(v_key,v_stock-v_base);
    end if;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_item_id,'unitLabel',v_unit_label,'quantity',v_qty,'freeQuantity',v_free,'factor',v_factor,'quantityBase',v_base,'freeBase',v_free_base,'unitPrice',v_price,'taxPercent',v_tax_pct,'discount',v_disc,'subtotal',v_sub,'tax',v_line_tax,'lineTotal',v_line_total,'averageCost',coalesce(v_item.average_cost_base,0),'mrp',coalesce(v_item.mrp_per_base,0),'itemCode',v_item.item_code));
    v_subtotal:=v_subtotal+v_sub; v_line_tax_sum:=v_line_tax_sum+v_line_tax; v_line_disc_sum:=v_line_disc_sum+v_disc;
  end loop;
  v_tax:=round(v_subtotal*v_tax/100,2);
  v_total:=round(v_subtotal+v_line_tax_sum+v_tax-v_line_disc_sum-v_discount,2);
  if v_discount>v_subtotal+v_line_tax_sum+v_tax-v_line_disc_sum or v_paid>v_total then raise exception 'Invoice discount or paid amount exceeds the invoice total'; end if;
  v_invoice_id:=gen_random_uuid();
  v_party_name:=nullif(left(btrim(coalesce(p_custom_party_name,'')),180),'');
  insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by,verification_token,custom_party_name,custom_party_address,custom_party_phone,created_at,updated_at)
  values(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,v_payment_method,p_transaction_id,nullif(left(btrim(coalesce(p_notes,'')),2000),''),round(v_subtotal,2),coalesce(p_tax_percent,0),v_discount,v_tax,round(v_line_tax_sum,2),round(v_line_disc_sum,2),v_paid,round(v_total-v_paid,2),p_created_by,gen_random_uuid(),v_party_name,nullif(left(btrim(coalesce(p_custom_party_address,'')),240),''),nullif(left(btrim(coalesce(p_custom_party_phone,'')),60),''),v_now,v_now)
  returning * into v_invoice;
  v_total_sub:=greatest(0,round(v_subtotal,2)); v_total_tax:=round(v_line_tax_sum,2); v_total_disc:=round(v_line_disc_sum,2);
  for v_raw in select value from jsonb_array_elements(v_lines) as t(value) loop
    v_item_id:=(v_raw->>'productId')::uuid; v_qty:=(v_raw->>'quantity')::numeric; v_free:=(v_raw->>'freeQuantity')::numeric;
    v_base:=(v_raw->>'quantityBase')::numeric; v_free_base:=(v_raw->>'freeBase')::numeric; v_factor:=(v_raw->>'factor')::numeric;
    v_unit_label:=v_raw->>'unitLabel'; v_price:=(v_raw->>'unitPrice')::numeric; v_tax_pct:=(v_raw->>'taxPercent')::numeric; v_disc:=(v_raw->>'discount')::numeric;
    v_sub:=(v_raw->>'subtotal')::numeric; v_line_tax:=(v_raw->>'tax')::numeric; v_line_total:=(v_raw->>'lineTotal')::numeric;
    v_line_id:=gen_random_uuid();
    if p_kind='purchase' then
      v_global_alloc:=case when v_total_sub>0 then round(v_discount*(v_sub/v_total_sub),2) else 0 end;
      v_cost_base:=case when v_base+v_free_base>0 then greatest(0,(v_sub-v_disc-v_global_alloc)/(v_base+v_free_base)) else 0 end;
      insert into public.invoice_lines(id,invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
        values(v_line_id,v_invoice.id,v_item_id,v_qty,v_price,v_line_total,v_tax_pct,v_disc,round(v_cost_base*v_factor,2));
      insert into public.supershop_invoice_lines(invoice_line_id,store_id,inventory_item_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base,created_at)
        values(v_line_id,p_store_id,v_item_id,v_unit_label,v_factor,round(v_base+v_free_base,3),v_free_base,round(v_cost_base,6),(v_raw->>'mrp')::numeric,v_now);
      select total_stock into v_stock from public.inventory_items where id=v_item_id and store_id=p_store_id for update;
      update public.supershop_products set average_cost_base=case when v_stock+v_base+v_free_base>0 then round(((v_stock*average_cost_base)+greatest(0,(v_sub-v_disc-v_global_alloc)))/(v_stock+v_base+v_free_base),6) else average_cost_base end,updated_at=v_now where inventory_item_id=v_item_id and store_id=p_store_id;
      update public.inventory_items set total_stock=round(total_stock+v_base+v_free_base,3),updated_at=v_now where id=v_item_id and store_id=p_store_id;
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        select p_store_id,v_item_id,'purchase',round(v_base+v_free_base,3),total_stock-round(v_base+v_free_base,3),total_stock,v_cost_base,'invoice',v_invoice.id,'Purchase receipt '||p_invoice_number,p_idempotency_key||':purchase:'||v_line_id,p_created_by,v_now from public.inventory_items where id=v_item_id and store_id=p_store_id;
    else
      v_cost_base:=round(coalesce((v_raw->>'averageCost')::numeric,0),6);
      insert into public.invoice_lines(id,invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
        values(v_line_id,v_invoice.id,v_item_id,v_qty,v_price,v_line_total,v_tax_pct,v_disc,round(v_cost_base*v_factor,2));
      insert into public.supershop_invoice_lines(invoice_line_id,store_id,inventory_item_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base,created_at)
        values(v_line_id,p_store_id,v_item_id,v_unit_label,v_factor,v_base,0,v_cost_base,(v_raw->>'mrp')::numeric,v_now);
      update public.inventory_items set total_stock=round(total_stock-v_base,3),updated_at=v_now where id=v_item_id and store_id=p_store_id;
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        select p_store_id,v_item_id,'sale',-v_base,total_stock+v_base,total_stock,v_cost_base,'invoice',v_invoice.id,'Supershop sale '||p_invoice_number,p_idempotency_key||':sale:'||v_line_id,p_created_by,v_now from public.inventory_items where id=v_item_id and store_id=p_store_id;
    end if;
  end loop;
  insert into public.supershop_operations(store_id,operation_key,operation_type,result_id,invoice_id,created_by,created_at)
    values(p_store_id,p_idempotency_key,p_kind,v_invoice.id,v_invoice.id,p_created_by,v_now);
  return to_jsonb(v_invoice)||jsonb_build_object('idempotent',false);
end $$;

create or replace function public.supershop_adjust_stock(
  p_store_id uuid,p_inventory_item_id uuid,p_delta numeric,p_target_quantity numeric,p_movement_type text,p_reason text,p_idempotency_key text,p_created_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before numeric(16,3); v_after numeric(16,3); v_delta numeric(16,3); v_key text;
begin
  if length(coalesce(p_idempotency_key,''))<12 then raise exception 'A valid idempotency key is required'; end if;
  select result_id into v_key from public.supershop_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if v_key is not null then return jsonb_build_object('id',v_key,'idempotent',true); end if;
  select i.total_stock into v_before from public.inventory_items i join public.supershop_products sp on sp.inventory_item_id=i.id and sp.store_id=i.store_id
    where i.id=p_inventory_item_id and i.store_id=p_store_id and sp.active for update of i,sp;
  if not found then raise exception 'Product was not found in this shop'; end if;
  if p_target_quantity is not null then v_after:=round(p_target_quantity,3); else v_after:=round(v_before+coalesce(p_delta,0),3); end if;
  if v_after<0 or v_after>999999999 then raise exception 'Stock quantity is invalid'; end if;
  v_delta:=v_after-v_before; if v_delta=0 then raise exception 'Stock adjustment must change quantity'; end if;
  if p_movement_type not in ('adjustment','stock_count','waste','damage','opening') then raise exception 'Invalid stock movement type'; end if;
  if p_movement_type in ('damage','waste') and v_delta>=0 then raise exception 'Damage and waste movements must reduce stock'; end if;
  if p_movement_type='opening' and (v_delta<=0 or v_before>0) then raise exception 'Opening stock can only add quantity to an empty product'; end if;
  update public.inventory_items set total_stock=v_after,updated_at=now() where id=p_inventory_item_id and store_id=p_store_id;
  insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reason,idempotency_key,created_by)
    select p_store_id,p_inventory_item_id,p_movement_type,v_delta,v_before,v_after,sp.average_cost_base,'adjustment',nullif(left(btrim(coalesce(p_reason,'')),240),''),p_idempotency_key,p_created_by
    from public.supershop_products sp where sp.inventory_item_id=p_inventory_item_id and sp.store_id=p_store_id;
  insert into public.supershop_operations(store_id,operation_key,operation_type,result_id,created_by) values(p_store_id,p_idempotency_key,'adjustment',p_inventory_item_id,p_created_by);
  return jsonb_build_object('inventory_item_id',p_inventory_item_id,'stock_before',v_before,'stock_after',v_after,'delta',v_delta,'idempotent',false);
end $$;

create or replace function public.supershop_post_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_return_date date,p_reason text,p_notes text,p_refund_method text,p_transaction_id text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices%rowtype; v_return public.returns%rowtype; v_old public.returns%rowtype; v_raw jsonb; v_line record;
  v_qty numeric(14,3); v_base numeric(16,3); v_factor numeric(16,6); v_sub numeric(14,2); v_tax numeric(14,2); v_disc numeric(14,2); v_penalty numeric(14,2); v_amount numeric(14,2);
  v_total numeric(14,2):=0; v_subtotal numeric(14,2):=0; v_tax_total numeric(14,2):=0; v_disc_total numeric(14,2):=0; v_pen_total numeric(14,2):=0;
  v_due_credit numeric(14,2); v_refund numeric(14,2); v_item_total numeric(14,2); v_return_id uuid:=gen_random_uuid(); v_qty_returned numeric(14,3);
  v_stock numeric(16,3); v_after numeric(16,3); v_line_id uuid; v_key text; v_now timestamptz:=now(); v_method text;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Select 1–100 return lines'; end if;
  select r.* into v_old from public.supershop_operations o join public.returns r on r.id=o.result_id where o.store_id=p_store_id and o.operation_key=p_idempotency_key and o.operation_type='return';
  if found then return to_jsonb(v_old)||jsonb_build_object('idempotent',true); end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.supershop_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then raise exception 'Original invoice is not a Supershop sale in this shop'; end if;
  if not exists(select 1 from public.supershop_invoice_lines sl join public.invoice_lines il on il.id=sl.invoice_line_id where il.invoice_id=p_invoice_id and sl.store_id=p_store_id) then raise exception 'This invoice has no Supershop line data'; end if;
  if length(coalesce(p_idempotency_key,''))<12 then raise exception 'A valid idempotency key is required'; end if;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoiceLineId','')::uuid; v_qty:=round(coalesce(nullif(v_raw->>'quantity','')::numeric,0),3);
    if v_line_id is null or v_qty<=0 then raise exception 'Return quantity must be positive'; end if;
    select il.*,sl.unit_label,sl.unit_factor,sl.quantity_base,ii.total_stock,ii.description into v_line
      from public.invoice_lines il join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id
      join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id
      where il.id=v_line_id and il.invoice_id=p_invoice_id for update of ii;
    if not found then raise exception 'Return line does not belong to the selected sale'; end if;
    select coalesce(sum(x.quantity),0) into v_qty_returned from (
      select ri.quantity from public.return_items ri join public.returns r on r.id=ri.return_id where ri.invoice_line_id=v_line_id and r.store_id=p_store_id
      union all select ei.quantity from public.exchange_items ei join public.exchanges e on e.id=ei.exchange_id where ei.invoice_line_id=v_line_id and ei.item_type='returned' and e.store_id=p_store_id
    ) x;
    if v_qty>v_line.quantity-v_qty_returned+0.0001 then raise exception 'Return quantity exceeds the remaining quantity sold'; end if;
    v_base:=round(v_qty*v_line.unit_factor,3); v_sub:=round(v_qty*v_line.unit_price,2);
    v_tax:=round(v_sub*coalesce(v_line.tax_percent,v_invoice.tax_percent,0)/100,2);
    v_disc:=case when v_line.quantity>0 then round(v_line.discount*(v_qty/v_line.quantity),2) else 0 end;
    if v_invoice.subtotal>0 then v_disc:=v_disc+round(v_invoice.discount*(v_sub/v_invoice.subtotal),2); end if;
    v_penalty:=round(coalesce(nullif(v_raw->>'penalty','')::numeric,0),2);
    v_amount:=greatest(0,round(v_sub+v_tax-v_disc-v_penalty,2));
    v_total:=v_total+v_amount; v_subtotal:=v_subtotal+v_sub; v_tax_total:=v_tax_total+v_tax; v_disc_total:=v_disc_total+v_disc; v_pen_total:=v_pen_total+v_penalty;
  end loop;
  v_total:=round(v_total,2); v_due_credit:=least(v_total,greatest(0,v_invoice.total_due)); v_refund:=round(v_total-v_due_credit,2);
  v_method:=coalesce(nullif(lower(p_refund_method),''),'none');
  if v_refund>0 and v_method not in ('cash','bank','bkash','nagad','other') then raise exception 'Choose a refund method for the amount already paid'; end if;
  if v_refund=0 then v_method:='none'; end if;
  insert into public.returns(id,store_id,invoice_id,return_number,customer_id,customer_name,return_date,subtotal,tax_amount,discount_amount,penalty_amount,total_return_amount,refunded_amount,refund_method,transaction_id,status,notes,created_by,verification_token,created_at,updated_at)
    values(v_return_id,p_store_id,p_invoice_id,p_return_number, v_invoice.party_id,coalesce(v_invoice.custom_party_name,'Walk-in Customer'),coalesce(p_return_date,current_date),round(v_subtotal,2),round(v_tax_total,2),round(v_disc_total,2),round(v_pen_total,2),v_total,v_refund,v_method,p_transaction_id,'refunded',nullif(left(btrim(coalesce(p_notes,'')),2000),''),p_created_by,gen_random_uuid(),v_now,v_now)
    returning * into v_return;
  v_total:=0;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=(v_raw->>'invoiceLineId')::uuid; v_qty:=round((v_raw->>'quantity')::numeric,3);
    select il.*,sl.unit_label,sl.unit_factor,ii.total_stock,ii.id as inventory_item_id into v_line from public.invoice_lines il
      join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id
      where il.id=v_line_id and il.invoice_id=p_invoice_id for update of ii;
    v_base:=round(v_qty*v_line.unit_factor,3); v_sub:=round(v_qty*v_line.unit_price,2); v_tax:=round(v_sub*coalesce(v_line.tax_percent,v_invoice.tax_percent,0)/100,2);
    v_disc:=case when v_line.quantity>0 then round(v_line.discount*(v_qty/v_line.quantity),2) else 0 end;
    if v_invoice.subtotal>0 then v_disc:=v_disc+round(v_invoice.discount*(v_sub/v_invoice.subtotal),2); end if;
    v_penalty:=round(coalesce(nullif(v_raw->>'penalty','')::numeric,0),2); v_amount:=greatest(0,round(v_sub+v_tax-v_disc-v_penalty,2));
    if v_raw->>'reason' not in ('Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other') then raise exception 'Select a valid return reason'; end if;
    if v_raw->>'reason'='Other' and length(trim(coalesce(v_raw->>'reasonNote','')))=0 then raise exception 'A note is required for Other'; end if;
    if v_raw->>'condition' not in ('Sellable','Damaged','Defective') then raise exception 'Select a valid returned-item condition'; end if;
    insert into public.return_items(return_id,invoice_line_id,item_id,quantity,unit_price,tax_percent,tax_amount,discount,penalty,return_amount,reason,reason_note,condition,created_at)
      values(v_return_id,v_line_id,v_line.item_id,v_qty,v_line.unit_price,coalesce(v_line.tax_percent,v_invoice.tax_percent,0),v_tax,v_disc,v_penalty,v_amount,v_raw->>'reason',nullif(left(btrim(coalesce(v_raw->>'reasonNote','')),240),''),v_raw->>'condition',v_now);
    if v_raw->>'condition'='Sellable' then
      v_stock:=v_line.total_stock; v_after:=round(v_stock+v_base,3);
      update public.inventory_items set total_stock=v_after,updated_at=v_now where id=v_line.item_id and store_id=p_store_id;
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        values(p_store_id,v_line.item_id,'return_restock',v_base,v_stock,v_after,(select average_cost_base from public.supershop_products where inventory_item_id=v_line.item_id), 'return',v_return_id,'Sellable customer return',p_idempotency_key||':return:'||v_line_id,p_created_by,v_now);
    else
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        values(p_store_id,v_line.item_id,case when v_raw->>'condition'='Damaged' then 'return_damaged' else 'return_defective' end,v_base,v_line.total_stock,v_line.total_stock,'return',v_return_id,'Quarantined customer return ('||v_raw->>'condition'||')',p_idempotency_key||':return:'||v_line_id,p_created_by,v_now);
    end if;
  end loop;
  update public.invoices set total_due=greatest(0,total_due-v_due_credit),updated_at=v_now where id=p_invoice_id and store_id=p_store_id;
  insert into public.supershop_operations(store_id,operation_key,operation_type,result_id,invoice_id,created_by,created_at) values(p_store_id,p_idempotency_key,'return',v_return_id,p_invoice_id,p_created_by,v_now);
  return to_jsonb(v_return)||jsonb_build_object('due_reduction',v_due_credit,'idempotent',false);
end $$;

create or replace function public.supershop_post_supplier_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_return_date date,p_reason text,p_notes text,p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices%rowtype; v_old public.supershop_supplier_returns%rowtype; v_return public.supershop_supplier_returns%rowtype; v_raw jsonb; v_line record;
  v_qty numeric(14,3); v_base numeric(16,3); v_free numeric(16,3); v_returned numeric(16,3); v_paid_base numeric(16,3); v_factor numeric(16,6); v_cost numeric(16,6); v_amount numeric(14,2);
  v_total numeric(14,2):=0; v_due numeric(14,2); v_credit numeric(14,2); v_id uuid:=gen_random_uuid(); v_now timestamptz:=now(); v_key text; v_stock numeric(16,3);
begin
  select * into v_old from public.supershop_supplier_returns where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_old)||jsonb_build_object('idempotent',true); end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='purchase' for update;
  if not found or not exists(select 1 from public.supershop_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='purchase') then raise exception 'Purchase invoice is not a Supershop purchase in this shop'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or length(coalesce(p_idempotency_key,''))<12 then raise exception 'Select return lines and provide a valid operation key'; end if;
  if length(coalesce(p_reason,''))<3 then raise exception 'Supplier-return reason is required'; end if;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_key:=nullif(v_raw->>'invoiceLineId','')::uuid::text; v_qty:=round(coalesce(nullif(v_raw->>'quantity','')::numeric,0),3);
    if v_key is null or v_qty<=0 then raise exception 'Supplier return quantities must be positive'; end if;
    select il.*,sl.unit_label,sl.unit_factor,sl.quantity_base,sl.free_quantity_base,sl.unit_cost_base,ii.total_stock
      into v_line from public.invoice_lines il join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id
      join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id
      where il.id=v_key::uuid and il.invoice_id=p_invoice_id for update of ii;
    if not found then raise exception 'Purchase line does not belong to this invoice'; end if;
    v_base:=round(v_qty*v_line.unit_factor,3);
    select coalesce(sum(quantity_base),0),coalesce(sum(free_quantity_base),0) into v_returned,v_free from public.supershop_supplier_return_items where invoice_line_id=v_key::uuid and store_id=p_store_id;
    if v_base>v_line.quantity_base-coalesce(v_returned,0)+0.0001 then raise exception 'Supplier return quantity exceeds received stock'; end if;
    if v_base>v_line.total_stock+0.0001 then raise exception 'Insufficient stock on hand to return this quantity'; end if;
    v_free:=least(v_base,greatest(0,v_line.free_quantity_base-coalesce(v_free,0))); v_paid_base:=greatest(0,v_base-v_free);
    v_cost:=case when v_line.unit_factor>0 then v_line.unit_price/v_line.unit_factor else 0 end;
    v_total:=v_total+round(v_paid_base*v_cost,2);
  end loop;
  v_total:=round(v_total,2); v_due:=least(v_total,greatest(0,v_invoice.total_due)); v_credit:=round(v_total-v_due,2);
  insert into public.supershop_supplier_returns(id,store_id,purchase_invoice_id,supplier_id,return_number,return_date,total_return_amount,due_reduction,supplier_credit,reason,notes,idempotency_key,created_by,created_at)
    values(v_id,p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,coalesce(p_return_date,current_date),v_total,v_due,v_credit,left(btrim(p_reason),240),nullif(left(btrim(coalesce(p_notes,'')),2000),''),p_idempotency_key,p_created_by,v_now) returning * into v_return;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_key:=(v_raw->>'invoiceLineId'); v_qty:=round((v_raw->>'quantity')::numeric,3);
    select il.*,sl.unit_label,sl.unit_factor,sl.quantity_base,sl.free_quantity_base,ii.total_stock,ii.id as inventory_item_id
      into v_line from public.invoice_lines il join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id
      join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id where il.id=v_key::uuid and il.invoice_id=p_invoice_id for update of ii;
    v_base:=round(v_qty*v_line.unit_factor,3);
    select coalesce(sum(free_quantity_base),0) into v_free from public.supershop_supplier_return_items where invoice_line_id=v_key::uuid and store_id=p_store_id;
    v_free:=least(v_base,greatest(0,v_line.free_quantity_base-coalesce(v_free,0))); v_paid_base:=greatest(0,v_base-v_free);
    v_cost:=case when v_line.unit_factor>0 then v_line.unit_price/v_line.unit_factor else 0 end;
    v_amount:=round(v_paid_base*v_cost,2); v_stock:=v_line.total_stock;
    insert into public.supershop_supplier_return_items(return_id,store_id,invoice_line_id,inventory_item_id,quantity,quantity_base,free_quantity_base,unit_label,unit_factor,unit_cost_base,total_amount,created_at)
      values(v_id,p_store_id,v_key::uuid,v_line.item_id,v_qty,v_base,v_free,v_line.unit_label,v_line.unit_factor,v_cost,v_amount,v_now);
    update public.inventory_items set total_stock=round(total_stock-v_base,3),updated_at=v_now where id=v_line.item_id and store_id=p_store_id;
    insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
      select p_store_id,v_line.item_id,'supplier_return',-v_base,v_stock,total_stock,v_cost,'supplier_return',v_id,left(btrim(p_reason),240),p_idempotency_key||':line:'||v_key,p_created_by,v_now from public.inventory_items where id=v_line.item_id and store_id=p_store_id;
  end loop;
  update public.invoices set total_due=greatest(0,total_due-v_due),updated_at=v_now where id=p_invoice_id and store_id=p_store_id;
  insert into public.supershop_operations(store_id,operation_key,operation_type,result_id,invoice_id,created_by,created_at) values(p_store_id,p_idempotency_key,'supplier_return',v_id,p_invoice_id,p_created_by,v_now);
  return to_jsonb(v_return)||jsonb_build_object('idempotent',false);
end $$;

create or replace function public.supershop_post_exchange(
  p_store_id uuid,p_invoice_id uuid,p_exchange_number text,p_exchange_date date,p_payment_method text,p_transaction_id text,p_notes text,p_idempotency_key text,p_created_by uuid,
  p_returned_items jsonb,p_new_items jsonb,p_allow_price_override boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices%rowtype; v_old public.exchanges%rowtype; v_exchange public.exchanges%rowtype; v_raw jsonb; v_line record; v_item record; v_unit record;
  v_qty numeric(14,3); v_base numeric(16,3); v_sub numeric(14,2); v_tax numeric(14,2); v_disc numeric(14,2); v_total numeric(14,2);
  v_return_total numeric(14,2):=0; v_new_sub numeric(14,2):=0; v_new_tax numeric(14,2):=0; v_new_disc numeric(14,2):=0; v_new_total numeric(14,2):=0;
  v_difference numeric(14,2); v_action text; v_method text; v_id uuid:=gen_random_uuid(); v_now timestamptz:=now(); v_line_id uuid; v_stock numeric(16,3); v_after numeric(16,3); v_factor numeric(16,6); v_unit_label text; v_price numeric(14,2); v_tax_pct numeric(7,3);
  v_left jsonb:='{}'::jsonb; v_key text; v_cost numeric(16,6); v_returned numeric(14,3); v_party_name text; v_due_reduction numeric(14,2); v_refund_paid numeric(14,2);
begin
  select e.* into v_old from public.supershop_operations o join public.exchanges e on e.id=o.result_id where o.store_id=p_store_id and o.operation_key=p_idempotency_key and o.operation_type='exchange';
  if found then return to_jsonb(v_old)||jsonb_build_object('idempotent',true); end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.supershop_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then raise exception 'Original invoice is not a Supershop sale in this shop'; end if;
  if jsonb_typeof(p_returned_items)<>'array' or jsonb_array_length(p_returned_items)<1 or jsonb_typeof(p_new_items)<>'array' or jsonb_array_length(p_new_items)<1 then raise exception 'An exchange needs returned and replacement items'; end if;
  if length(coalesce(p_idempotency_key,''))<12 then raise exception 'A valid idempotency key is required'; end if;
  for v_raw in select value from jsonb_array_elements(p_returned_items) loop
    v_line_id:=nullif(v_raw->>'invoiceLineId','')::uuid; v_qty:=round(coalesce(nullif(v_raw->>'quantity','')::numeric,0),3);
    select il.*,sl.unit_label,sl.unit_factor,ii.total_stock into v_line from public.invoice_lines il join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id
      join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id where il.id=v_line_id and il.invoice_id=p_invoice_id for update of ii;
    if not found or v_qty<=0 then raise exception 'Invalid returned exchange line'; end if;
    select coalesce(sum(x.quantity),0) into v_returned from (
      select ri.quantity from public.return_items ri join public.returns r on r.id=ri.return_id where ri.invoice_line_id=v_line_id and r.store_id=p_store_id
      union all select ei.quantity from public.exchange_items ei join public.exchanges e on e.id=ei.exchange_id where ei.invoice_line_id=v_line_id and e.store_id=p_store_id and ei.item_type='returned'
    ) x;
    if v_qty>v_line.quantity-v_returned+0.0001 then raise exception 'Exchange return quantity exceeds remaining sale quantity'; end if;
    v_sub:=round(v_qty*v_line.unit_price,2); v_tax:=round(v_sub*coalesce(v_line.tax_percent,v_invoice.tax_percent,0)/100,2);
    v_disc:=case when v_line.quantity>0 then round(v_line.discount*(v_qty/v_line.quantity),2) else 0 end;
    if v_invoice.subtotal>0 then v_disc:=v_disc+round(v_invoice.discount*(v_sub/v_invoice.subtotal),2); end if;
    v_return_total:=v_return_total+greatest(0,round(v_sub+v_tax-v_disc,2));
  end loop;
  for v_raw in select value from jsonb_array_elements(p_new_items) loop
    v_line_id:=nullif(v_raw->>'productId','')::uuid; v_unit_label:=left(lower(btrim(coalesce(v_raw->>'unitLabel',''))),60); v_qty:=round(coalesce(nullif(v_raw->>'quantity','')::numeric,0),3);
    if v_line_id is null or v_qty<=0 then raise exception 'Invalid replacement line'; end if;
    select i.*,sp.average_cost_base,sp.tax_percent as product_tax,sp.mrp_per_base,sp.active as product_active into v_item from public.inventory_items i join public.supershop_products sp on sp.inventory_item_id=i.id and sp.store_id=i.store_id where i.id=v_line_id and i.store_id=p_store_id for update of i,sp;
    if not found or not v_item.active or not v_item.product_active then raise exception 'Replacement product is inactive or not in this shop'; end if;
    select * into v_unit from public.supershop_product_units where store_id=p_store_id and inventory_item_id=v_line_id and lower(unit_label)=v_unit_label and can_sell;
    if not found then raise exception 'Replacement unit is not available for sale'; end if;
    if not v_unit.allow_fractional and v_qty<>trunc(v_qty) then raise exception 'Replacement unit does not allow decimal quantities'; end if;
    v_factor:=v_unit.factor_to_base; v_base:=round(v_qty*v_factor,3); v_key:=v_line_id::text;
    if v_left ? v_key then v_stock:=coalesce((v_left->>v_key)::numeric,0); else v_stock:=v_item.total_stock; end if;
    if v_stock<v_base then raise exception 'Insufficient stock for replacement product %',v_item.description; end if;
    v_left:=v_left||jsonb_build_object(v_key,v_stock-v_base);
    v_price:=case when p_allow_price_override then coalesce(nullif(v_raw->>'unitPrice','')::numeric,v_unit.selling_price,v_item.sale_price*v_factor) else coalesce(v_unit.selling_price,v_item.sale_price*v_factor) end;
    v_price:=round(v_price,2); v_tax_pct:=round(coalesce(nullif(v_raw->>'taxPercent','')::numeric,v_item.product_tax,0),3);
    v_sub:=round(v_qty*v_price,2); v_tax:=round(v_sub*v_tax_pct/100,2); v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    if v_price<0 or v_tax_pct<0 or v_tax_pct>100 or v_disc<0 or v_disc>v_sub+v_tax then raise exception 'Replacement price or discount is invalid'; end if;
    v_new_sub:=v_new_sub+v_sub; v_new_tax:=v_new_tax+v_tax; v_new_disc:=v_new_disc+v_disc; v_new_total:=v_new_total+round(v_sub+v_tax-v_disc,2);
  end loop;
  v_return_total:=round(v_return_total,2); v_new_sub:=round(v_new_sub,2); v_new_tax:=round(v_new_tax,2); v_new_disc:=round(v_new_disc,2); v_new_total:=round(v_new_total,2);
  v_difference:=round(v_new_total-v_return_total,2); v_action:=case when v_difference>0 then 'payment' when v_difference<0 then 'refund' else 'even' end;
  v_due_reduction:=case when v_difference>=0 then least(greatest(0,v_invoice.total_due),v_return_total) else least(greatest(0,v_invoice.total_due),greatest(0,v_return_total-v_new_total)) end;
  v_refund_paid:=greatest(0,round(v_return_total-v_new_total-v_due_reduction,2));
  v_method:=case when v_action='even' or (v_action='refund' and v_refund_paid=0) then 'none' else coalesce(nullif(lower(p_payment_method),''),'cash') end;
  if ((v_action='payment') or v_refund_paid>0) and v_method not in ('cash','bank','bkash','nagad','other') then raise exception 'Choose a valid exchange payment or refund method'; end if;
  v_party_name:=coalesce(v_invoice.custom_party_name,'Walk-in Customer');
  insert into public.exchanges(id,store_id,invoice_id,exchange_number,customer_id,customer_name,exchange_date,returned_total,new_items_subtotal,new_items_tax,new_items_discount,new_items_total,difference_amount,action_type,payment_method,transaction_id,status,notes,created_by,verification_token,created_at,updated_at)
    values(v_id,p_store_id,p_invoice_id,p_exchange_number,v_invoice.party_id,v_party_name,coalesce(p_exchange_date,current_date),v_return_total,v_new_sub,v_new_tax,v_new_disc,v_new_total,v_difference,v_action,v_method,p_transaction_id,'completed',nullif(left(btrim(coalesce(p_notes,'')),2000),''),p_created_by,gen_random_uuid(),v_now,v_now)
    returning * into v_exchange;
  for v_raw in select value from jsonb_array_elements(p_returned_items) loop
    v_line_id:=(v_raw->>'invoiceLineId')::uuid; v_qty:=(v_raw->>'quantity')::numeric;
    select il.*,sl.unit_label,sl.unit_factor,sl.unit_cost_base,ii.total_stock,ii.id as inventory_item_id into v_line from public.invoice_lines il join public.supershop_invoice_lines sl on sl.invoice_line_id=il.id and sl.store_id=p_store_id
      join public.inventory_items ii on ii.id=il.item_id and ii.store_id=p_store_id where il.id=v_line_id and il.invoice_id=p_invoice_id for update of ii;
    v_base:=round(v_qty*v_line.unit_factor,3); v_sub:=round(v_qty*v_line.unit_price,2); v_tax:=round(v_sub*coalesce(v_line.tax_percent,v_invoice.tax_percent,0)/100,2);
    v_disc:=case when v_line.quantity>0 then round(v_line.discount*(v_qty/v_line.quantity),2) else 0 end; if v_invoice.subtotal>0 then v_disc:=v_disc+round(v_invoice.discount*(v_sub/v_invoice.subtotal),2); end if;
    v_total:=greatest(0,round(v_sub+v_tax-v_disc,2));
    if v_raw->>'reason' not in ('Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other') then raise exception 'Select a valid exchange reason'; end if;
    if v_raw->>'reason'='Other' and length(trim(coalesce(v_raw->>'reasonNote','')))=0 then raise exception 'A note is required for Other'; end if;
    if v_raw->>'condition' not in ('Sellable','Damaged','Defective') then raise exception 'Select a valid returned condition'; end if;
    v_line_id:=gen_random_uuid();
    insert into public.exchange_items(id,exchange_id,item_type,invoice_line_id,item_id,quantity,unit_price,tax_percent,tax_amount,discount,total_amount,reason,reason_note,condition,created_at)
      values(v_line_id,v_id,'returned',(v_raw->>'invoiceLineId')::uuid,v_line.item_id,v_qty,v_line.unit_price,coalesce(v_line.tax_percent,v_invoice.tax_percent,0),v_tax,v_disc,v_total,v_raw->>'reason',nullif(left(btrim(coalesce(v_raw->>'reasonNote','')),240),''),v_raw->>'condition',v_now);
    insert into public.supershop_exchange_lines(exchange_item_id,store_id,inventory_item_id,unit_label,unit_factor,quantity_base,unit_cost_base,created_at) values(v_line_id,p_store_id,v_line.item_id,v_line.unit_label,v_line.unit_factor,v_base,v_line.unit_cost_base,v_now);
    if v_raw->>'condition'='Sellable' then
      v_stock:=v_line.total_stock; v_after:=round(v_stock+v_base,3); update public.inventory_items set total_stock=v_after,updated_at=v_now where id=v_line.item_id and store_id=p_store_id;
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        values(p_store_id,v_line.item_id,'exchange_in',v_base,v_stock,v_after,v_line.unit_cost_base,'exchange',v_id,'Sellable exchange return',p_idempotency_key||':in:'||v_line_id,p_created_by,v_now);
    else
      insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        values(p_store_id,v_line.item_id,'return_'||lower(v_raw->>'condition'),v_base,v_line.total_stock,v_line.total_stock,v_line.unit_cost_base,'exchange',v_id,'Quarantined exchange return',p_idempotency_key||':quarantine:'||v_line_id,p_created_by,v_now);
    end if;
  end loop;
  for v_raw in select value from jsonb_array_elements(p_new_items) loop
    v_line_id:=(v_raw->>'productId')::uuid; v_unit_label:=left(lower(btrim(v_raw->>'unitLabel')),60); v_qty:=round((v_raw->>'quantity')::numeric,3);
    select i.*,sp.average_cost_base,sp.tax_percent as product_tax into v_item from public.inventory_items i join public.supershop_products sp on sp.inventory_item_id=i.id and sp.store_id=i.store_id where i.id=v_line_id and i.store_id=p_store_id for update of i,sp;
    select * into v_unit from public.supershop_product_units where store_id=p_store_id and inventory_item_id=v_line_id and lower(unit_label)=v_unit_label and can_sell;
    v_factor:=v_unit.factor_to_base; v_base:=round(v_qty*v_factor,3); v_price:=case when p_allow_price_override then coalesce(nullif(v_raw->>'unitPrice','')::numeric,v_unit.selling_price,v_item.sale_price*v_factor) else coalesce(v_unit.selling_price,v_item.sale_price*v_factor) end; v_price:=round(v_price,2);
    v_tax_pct:=round(coalesce(nullif(v_raw->>'taxPercent','')::numeric,v_item.product_tax,0),3); v_sub:=round(v_qty*v_price,2); v_tax:=round(v_sub*v_tax_pct/100,2); v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2); v_total:=round(v_sub+v_tax-v_disc,2); v_cost:=coalesce(v_item.average_cost_base,0);
    v_line_id:=gen_random_uuid();
    insert into public.exchange_items(id,exchange_id,item_type,invoice_line_id,item_id,quantity,unit_price,tax_percent,tax_amount,discount,total_amount,condition,created_at)
      values(v_line_id,v_id,'new',null,v_item.id,v_qty,v_price,v_tax_pct,v_tax,v_disc,v_total,'Sellable',v_now);
    insert into public.supershop_exchange_lines(exchange_item_id,store_id,inventory_item_id,unit_label,unit_factor,quantity_base,unit_cost_base,created_at) values(v_line_id,p_store_id,v_item.id,v_unit_label,v_factor,v_base,v_cost,v_now);
    v_stock:=v_item.total_stock; v_after:=round(v_stock-v_base,3); update public.inventory_items set total_stock=v_after,updated_at=v_now where id=v_item.id and store_id=p_store_id;
    insert into public.supershop_stock_movements(store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
      values(p_store_id,v_item.id,'exchange_out',-v_base,v_stock,v_after,v_cost,'exchange',v_id,'Replacement item issued',p_idempotency_key||':out:'||v_line_id,p_created_by,v_now);
  end loop;
  update public.invoices set total_due=greatest(0,total_due-v_due_reduction),updated_at=v_now where id=p_invoice_id and store_id=p_store_id;
  insert into public.supershop_exchange_settlements(exchange_id,store_id,due_reduction,payment_received,refund_paid,created_at)
    values(v_id,p_store_id,v_due_reduction,greatest(0,v_difference),v_refund_paid,v_now);
  insert into public.supershop_operations(store_id,operation_key,operation_type,result_id,invoice_id,created_by,created_at) values(p_store_id,p_idempotency_key,'exchange',v_id,p_invoice_id,p_created_by,v_now);
  return to_jsonb(v_exchange)||jsonb_build_object('idempotent',false);
end $$;

alter table public.supershop_products enable row level security;
alter table public.supershop_product_units enable row level security;
alter table public.supershop_invoice_lines enable row level security;
alter table public.supershop_stock_movements enable row level security;
alter table public.supershop_operations enable row level security;
alter table public.supershop_alerts enable row level security;
alter table public.supershop_supplier_returns enable row level security;
alter table public.supershop_supplier_return_items enable row level security;
alter table public.supershop_exchange_lines enable row level security;
alter table public.supershop_exchange_settlements enable row level security;
grant all on public.supershop_products,public.supershop_product_units,public.supershop_invoice_lines,public.supershop_stock_movements,public.supershop_operations,public.supershop_alerts,public.supershop_supplier_returns,public.supershop_supplier_return_items,public.supershop_exchange_lines,public.supershop_exchange_settlements to service_role;
revoke all on function public.supershop_save_product(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.supershop_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.supershop_adjust_stock(uuid,uuid,numeric,numeric,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.supershop_post_return(uuid,uuid,text,date,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.supershop_post_supplier_return(uuid,uuid,text,date,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.supershop_post_exchange(uuid,uuid,text,date,text,text,text,text,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.supershop_save_product(uuid,uuid,jsonb,jsonb,uuid) to service_role;
grant execute on function public.supershop_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,text,text,text,boolean) to service_role;
grant execute on function public.supershop_adjust_stock(uuid,uuid,numeric,numeric,text,text,text,uuid) to service_role;
grant execute on function public.supershop_post_return(uuid,uuid,text,date,text,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.supershop_post_supplier_return(uuid,uuid,text,date,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.supershop_post_exchange(uuid,uuid,text,date,text,text,text,text,uuid,jsonb,jsonb,boolean) to service_role;

commit;

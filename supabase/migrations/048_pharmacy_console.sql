-- EMS Pharmacy Console. Additive schema; preserves existing stores and ledger rows.
begin;

alter table public.stores drop constraint if exists stores_shop_type_check;
alter table public.stores add constraint stores_shop_type_check
  check (shop_type in ('electronics','clothing','pharmacy'));
alter table public.stores add column if not exists business_type text not null default 'electronics';
update public.stores set business_type=shop_type where business_type='electronics' and shop_type<>'electronics';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='stores_business_type_check' and conrelid='public.stores'::regclass) then
    alter table public.stores add constraint stores_business_type_check check (business_type in ('electronics','clothing','pharmacy'));
  end if;
end $$;

create table if not exists public.pharmacy_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  expiry_warning_days integer not null default 90 check (expiry_warning_days between 1 and 730),
  low_stock_default numeric(14,3) not null default 5 check (low_stock_default >= 0),
  categories jsonb not null default '["Prescription","OTC","Medical devices","Hygiene","Healthcare supplies"]'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_shelves (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  aisle text,
  rack text,
  shelf text,
  bin text,
  notes text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,label)
);
create index if not exists pharmacy_shelves_store_active_idx on public.pharmacy_shelves(store_id,active,label);

create table if not exists public.pharmacy_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null unique references public.inventory_items(id) on delete restrict,
  name text not null,
  generic_name text,
  brand text,
  strength text,
  dosage_form text not null default 'other',
  category text not null default 'Medicine',
  manufacturer text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  barcode text,
  base_unit text not null default 'tablet',
  purchase_price numeric(14,2) not null default 0 check(purchase_price>=0),
  sale_price numeric(14,2) not null default 0 check(sale_price>=0),
  reorder_threshold numeric(14,3) not null default 5 check(reorder_threshold>=0),
  default_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  prescription_required boolean not null default false,
  tracks_batch boolean not null default true,
  tracks_expiry boolean not null default true,
  description text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,barcode)
);
create index if not exists pharmacy_products_store_category_name_idx on public.pharmacy_products(store_id,category,name);
create index if not exists pharmacy_products_store_idx on public.pharmacy_products(store_id,active);
create index if not exists pharmacy_products_supplier_idx on public.pharmacy_products(store_id,supplier_id);

create table if not exists public.pharmacy_product_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete cascade,
  unit_label text not null,
  factor_to_base numeric(16,6) not null check(factor_to_base>0),
  allow_fractional boolean not null default false,
  can_purchase boolean not null default false,
  can_sell boolean not null default true,
  purchase_price numeric(14,2) check(purchase_price is null or purchase_price>=0),
  selling_price numeric(14,2) check(selling_price is null or selling_price>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,unit_label)
);
create index if not exists pharmacy_product_units_store_product_idx on public.pharmacy_product_units(store_id,product_id);

create table if not exists public.pharmacy_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_number text,
  manufacturing_date date,
  expiry_date date,
  quantity_on_hand_base numeric(16,3) not null default 0 check(quantity_on_hand_base>=0),
  free_quantity_base numeric(16,3) not null default 0 check(free_quantity_base>=0),
  unit_cost numeric(14,6) not null default 0 check(unit_cost>=0),
  mrp_per_base numeric(14,4) not null default 0 check(mrp_per_base>=0),
  status text not null default 'available' check(status in ('available','quarantined','blocked','recalled','expired')),
  location_id uuid references public.pharmacy_shelves(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_invoice_id uuid references public.invoices(id) on delete set null,
  purchase_invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pharmacy_batches_fefo_idx on public.pharmacy_batches(store_id,product_id,status,expiry_date,created_at);
create index if not exists pharmacy_batches_expiry_idx on public.pharmacy_batches(store_id,expiry_date) where quantity_on_hand_base>0;
create index if not exists pharmacy_batches_location_idx on public.pharmacy_batches(store_id,location_id);
create index if not exists pharmacy_batches_purchase_idx on public.pharmacy_batches(purchase_invoice_id,purchase_invoice_line_id);

create table if not exists public.pharmacy_invoice_lines (
  invoice_line_id uuid primary key references public.invoice_lines(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  unit_label text not null,
  unit_factor numeric(16,6) not null check(unit_factor>0),
  quantity_base numeric(16,3) not null check(quantity_base>0),
  free_quantity_base numeric(16,3) not null default 0 check(free_quantity_base>=0),
  unit_cost_base numeric(14,6) not null default 0,
  mrp_per_base numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_invoice_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete cascade,
  batch_id uuid not null references public.pharmacy_batches(id) on delete restrict,
  movement_kind text not null check(movement_kind in ('purchase','sale','return')),
  quantity_base numeric(16,3) not null check(quantity_base>0),
  created_at timestamptz not null default now(),
  unique(invoice_line_id,batch_id,movement_kind)
);
create index if not exists pharmacy_invoice_batches_batch_idx on public.pharmacy_invoice_batches(batch_id,created_at);

create table if not exists public.pharmacy_stock_movements (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_id uuid references public.pharmacy_batches(id) on delete set null,
  movement_type text not null,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  stock_before numeric(16,3) not null default 0,
  stock_after numeric(16,3) not null default 0,
  from_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  to_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  reference_type text,
  reference_id uuid,
  reason text,
  idempotency_key text unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_stock_movements_product_idx on public.pharmacy_stock_movements(store_id,product_id,created_at desc);
create index if not exists pharmacy_stock_movements_batch_idx on public.pharmacy_stock_movements(batch_id,created_at desc);

create table if not exists public.pharmacy_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  operation_key text not null,
  operation_type text not null check(operation_type in ('sale','purchase','return','exchange','supplier_return','move')),
  invoice_id uuid references public.invoices(id) on delete restrict,
  result_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,operation_key)
);

create table if not exists public.pharmacy_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  alert_key text not null,
  severity text not null default 'warning' check(severity in ('info','warning','critical')),
  title text not null,
  detail text not null,
  href text not null default 'pharmacy-dashboard',
  status text not null default 'unread' check(status in ('unread','read','resolved')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,alert_key)
);
create index if not exists pharmacy_alerts_store_status_idx on public.pharmacy_alerts(store_id,status,updated_at desc);

create table if not exists public.pharmacy_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  return_number text not null,
  customer_name text not null default 'Walk-in customer',
  return_date date not null default current_date,
  return_type text not null default 'return' check(return_type in ('return','exchange')),
  amount numeric(14,2) not null default 0 check(amount>=0),
  refund_method text not null default 'none',
  disposition text not null default 'quarantined',
  reason text not null,
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,return_number),
  unique(store_id,idempotency_key)
);
create index if not exists pharmacy_returns_invoice_idx on public.pharmacy_returns(store_id,invoice_id,created_at desc);

create table if not exists public.pharmacy_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.pharmacy_returns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_id uuid references public.pharmacy_batches(id) on delete restrict,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  condition text not null check(condition in ('sellable','quarantined','damaged','recalled','expired')),
  reason text not null,
  amount numeric(14,2) not null default 0 check(amount>=0),
  restocked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_return_items_invoice_line_idx on public.pharmacy_return_items(invoice_line_id);

create table if not exists public.pharmacy_supplier_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
  batch_id uuid not null references public.pharmacy_batches(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  return_number text not null,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  amount numeric(14,2) not null check(amount>=0),
  reason text not null,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,return_number),
  unique(store_id,idempotency_key)
);
create index if not exists pharmacy_supplier_returns_purchase_idx on public.pharmacy_supplier_returns(store_id,purchase_invoice_id,created_at desc);

-- Every pharmacy table is available only to the server's service-role path.
do $$ declare t text; begin
  foreach t in array array['pharmacy_settings','pharmacy_shelves','pharmacy_products','pharmacy_product_units','pharmacy_batches','pharmacy_invoice_lines','pharmacy_invoice_batches','pharmacy_stock_movements','pharmacy_operations','pharmacy_alerts','pharmacy_returns','pharmacy_return_items','pharmacy_supplier_returns'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.pharmacy_stock_movements_id_seq to service_role;

create or replace function public.pharmacy_save_product(p_store_id uuid,p_product_id uuid,p_product jsonb,p_units jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_product public.pharmacy_products; v_item public.inventory_items; v_unit jsonb; v_name text; v_sku text; v_base text; v_product_id uuid; v_item_id uuid; v_desc text;
begin
  if jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)=0 then raise exception 'At least one medicine selling or purchase unit is required'; end if;
  v_name:=btrim(coalesce(p_product->>'name','')); v_sku:=upper(btrim(coalesce(p_product->>'sku',''))); v_base:=lower(btrim(coalesce(p_product->>'base_unit','tablet')));
  if v_name='' then raise exception 'Medicine name is required'; end if;
  if not exists(select 1 from jsonb_array_elements(p_units) u where lower(btrim(u->>'unit_label'))=v_base and (u->>'factor_to_base')::numeric=1) then raise exception 'Base unit must have a conversion factor of exactly 1'; end if;
  if exists(select 1 from jsonb_array_elements(p_units) u where coalesce((u->>'factor_to_base')::numeric,0)<=0) then raise exception 'Pack conversion factors must be greater than zero'; end if;
  v_desc:=concat_ws(' · ',v_name,nullif(btrim(p_product->>'strength'),''),nullif(btrim(p_product->>'dosage_form'),''));
  if p_product_id is null then
    if v_sku='' then v_sku:='PH-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)); end if;
    if exists(select 1 from public.inventory_items where store_id=p_store_id and item_code=v_sku) then raise exception 'SKU already exists in this shop'; end if;
    insert into public.inventory_items(store_id,item_code,description,unit,sale_price,total_stock,active,category)
      values(p_store_id,v_sku,v_desc,v_base,coalesce((p_product->>'sale_price')::numeric,0),0,true,coalesce(nullif(p_product->>'category',''),'Medicine')) returning * into v_item;
    v_item_id:=v_item.id;v_product_id:=gen_random_uuid();
    insert into public.pharmacy_products(id,store_id,inventory_item_id,name,generic_name,brand,strength,dosage_form,category,manufacturer,supplier_id,barcode,base_unit,purchase_price,sale_price,reorder_threshold,default_location_id,prescription_required,tracks_batch,tracks_expiry,description,active,created_by)
    values(v_product_id,p_store_id,v_item_id,v_name,nullif(btrim(p_product->>'generic_name'),''),nullif(btrim(p_product->>'brand'),''),nullif(btrim(p_product->>'strength'),''),coalesce(nullif(p_product->>'dosage_form',''),'other'),coalesce(nullif(p_product->>'category',''),'Medicine'),nullif(btrim(p_product->>'manufacturer'),''),nullif(p_product->>'supplier_id','')::uuid,nullif(btrim(p_product->>'barcode'),''),v_base,coalesce((p_product->>'purchase_price')::numeric,0),coalesce((p_product->>'sale_price')::numeric,0),coalesce((p_product->>'reorder_threshold')::numeric,5),nullif(p_product->>'default_location_id','')::uuid,coalesce((p_product->>'prescription_required')::boolean,false),coalesce((p_product->>'tracks_batch')::boolean,true),coalesce((p_product->>'tracks_expiry')::boolean,true),nullif(btrim(p_product->>'description'),''),true,p_actor) returning * into v_product;
  else
    select * into v_product from public.pharmacy_products where id=p_product_id and store_id=p_store_id for update;
    if not found then raise exception 'Medicine was not found in this shop'; end if;
    select * into v_item from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
    if not found then raise exception 'Linked inventory record was not found'; end if;
    if v_sku='' then v_sku:=v_item.item_code; end if;
    if (v_product.base_unit<>v_base or v_item.item_code<>v_sku) and (exists(select 1 from public.pharmacy_batches where product_id=v_product.id and quantity_on_hand_base>0) or exists(select 1 from public.pharmacy_invoice_lines where product_id=v_product.id)) then raise exception 'SKU and base unit cannot be changed after batch or invoice history exists'; end if;
    update public.inventory_items set item_code=v_sku,description=v_desc,unit=v_base,sale_price=coalesce((p_product->>'sale_price')::numeric,0),category=coalesce(nullif(p_product->>'category',''),'Medicine'),active=true,updated_at=now() where id=v_item.id;
    update public.pharmacy_products set name=v_name,generic_name=nullif(btrim(p_product->>'generic_name'),''),brand=nullif(btrim(p_product->>'brand'),''),strength=nullif(btrim(p_product->>'strength'),''),dosage_form=coalesce(nullif(p_product->>'dosage_form',''),'other'),category=coalesce(nullif(p_product->>'category',''),'Medicine'),manufacturer=nullif(btrim(p_product->>'manufacturer'),''),supplier_id=nullif(p_product->>'supplier_id','')::uuid,barcode=nullif(btrim(p_product->>'barcode'),''),base_unit=v_base,purchase_price=coalesce((p_product->>'purchase_price')::numeric,0),sale_price=coalesce((p_product->>'sale_price')::numeric,0),reorder_threshold=coalesce((p_product->>'reorder_threshold')::numeric,5),default_location_id=nullif(p_product->>'default_location_id','')::uuid,prescription_required=coalesce((p_product->>'prescription_required')::boolean,false),tracks_batch=coalesce((p_product->>'tracks_batch')::boolean,true),tracks_expiry=coalesce((p_product->>'tracks_expiry')::boolean,true),description=nullif(btrim(p_product->>'description'),''),updated_at=now() where id=v_product.id returning * into v_product;
    v_product_id:=v_product.id;v_item_id:=v_product.inventory_item_id;
  end if;
  for v_unit in select value from jsonb_array_elements(p_units) loop
    if lower(btrim(v_unit->>'unit_label'))='' then continue; end if;
    insert into public.pharmacy_product_units(store_id,product_id,unit_label,factor_to_base,allow_fractional,can_purchase,can_sell,purchase_price,selling_price)
    values(p_store_id,v_product_id,lower(btrim(v_unit->>'unit_label')),(v_unit->>'factor_to_base')::numeric,coalesce((v_unit->>'allow_fractional')::boolean,false),coalesce((v_unit->>'can_purchase')::boolean,false),coalesce((v_unit->>'can_sell')::boolean,true),nullif(v_unit->>'purchase_price','')::numeric,nullif(v_unit->>'selling_price','')::numeric)
    on conflict(product_id,unit_label) do update set factor_to_base=excluded.factor_to_base,allow_fractional=excluded.allow_fractional,can_purchase=excluded.can_purchase,can_sell=excluded.can_sell,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,updated_at=now();
  end loop;
  return jsonb_build_object('id',v_product_id,'inventory_item_id',v_item_id,'sku',v_sku);
end $$;

create or replace function public.pharmacy_post_invoice(
  p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method text,p_transaction_id text,p_notes text,
  p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb,p_operation_key text,p_allow_price_override boolean default false)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_item jsonb; v_product public.pharmacy_products; v_unit public.pharmacy_product_units; v_batch public.pharmacy_batches; v_line public.invoice_lines;
  v_operation public.pharmacy_operations; v_invoice_id uuid; v_line_id uuid; v_batch_id uuid; v_qty numeric; v_free numeric; v_factor numeric; v_base_qty numeric; v_free_base numeric;
  v_price numeric; v_tax_pct numeric; v_disc numeric; v_lsub numeric; v_ltax numeric; v_subtotal numeric:=0; v_line_tax numeric:=0; v_line_disc numeric:=0;
  v_tax numeric; v_total numeric; v_paid numeric; v_remaining numeric; v_take numeric; v_free_take numeric; v_cost numeric; v_cost_sum numeric; v_mrp numeric; v_stock_before numeric; v_stock_after numeric; v_location uuid;
  v_batch_text text; v_mfg date; v_exp date; v_reference text; v_key text; v_selected_batch uuid;
begin
  if p_kind not in ('sale','purchase') then raise exception 'Pharmacy invoice type is invalid'; end if;
  if p_operation_key is null or btrim(p_operation_key)='' then raise exception 'A retry-safe operation key is required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>200 then raise exception 'Add 1 to 200 pharmacy invoice lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_operation_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.invoice_id is null then raise exception 'This operation key is already being used for another Pharmacy workflow'; end if;
    select * into v_invoice from public.invoices where id=v_operation.invoice_id and store_id=p_store_id;
    if found then return v_invoice; end if;
  end if;
  if p_party_id is not null then
    if p_kind='sale' and not exists(select 1 from public.customers where id=p_party_id and store_id=p_store_id) then raise exception 'Customer does not belong to this shop'; end if;
    if p_kind='purchase' and not exists(select 1 from public.suppliers where id=p_party_id and store_id=p_store_id) then raise exception 'Supplier does not belong to this shop'; end if;
  end if;
  -- Lock and validate all product and unit rows before building the financial invoice.
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);v_free:=coalesce((v_item->>'freeQuantity')::numeric,0);
    if v_qty<=0 or v_free<0 then raise exception 'Line quantities must be positive and bonus quantities cannot be negative'; end if;
    select * into v_product from public.pharmacy_products where id=(v_item->>'productId')::uuid and store_id=p_store_id and active for update;
    if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_item->>'unitLabel')) for update;
    if not found or (p_kind='sale' and not v_unit.can_sell) or (p_kind='purchase' and not v_unit.can_purchase) then raise exception 'Selected unit is not enabled for this operation'; end if;
    if not v_unit.allow_fractional and (v_qty<>trunc(v_qty) or v_free<>trunc(v_free)) then raise exception 'This medicine unit does not allow fractional quantities'; end if;
    v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    if v_base_qty<=0 then raise exception 'Converted quantity must be greater than zero'; end if;
    if p_kind='purchase' and v_product.tracks_batch and coalesce(btrim(v_item->>'batchNumber'),'')='' then raise exception 'Batch / lot number is required for this medicine'; end if;
    if p_kind='purchase' and v_product.tracks_expiry and nullif(v_item->>'expiryDate','') is null then raise exception 'Expiry date is required for this medicine'; end if;
    if p_kind='purchase' and nullif(v_item->>'expiryDate','') is not null and (v_item->>'expiryDate')::date < current_date then raise exception 'Expired stock cannot be received into saleable stock'; end if;
    v_price:=coalesce((v_item->>'unitPrice')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    if v_price<0 then raise exception 'Price cannot be negative'; end if;
    v_tax_pct:=coalesce((v_item->>'taxPercent')::numeric,0);v_disc:=coalesce((v_item->>'discount')::numeric,0);
    if v_tax_pct<0 or v_disc<0 then raise exception 'Tax and discount cannot be negative'; end if;
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    if v_disc>v_lsub+v_ltax then raise exception 'Line discount cannot exceed its value'; end if;
    v_subtotal:=v_subtotal+v_lsub;v_line_tax:=v_line_tax+v_ltax;v_line_disc:=v_line_disc+v_disc;
  end loop;
  v_tax:=round(v_subtotal*coalesce(p_tax_percent,0)/100,2);v_total:=round(v_subtotal+v_line_tax+v_tax-v_line_disc-coalesce(p_discount,0),2);v_paid:=coalesce(p_paid_amount,0);
  if coalesce(p_tax_percent,0)<0 or coalesce(p_discount,0)<0 or v_paid<0 or v_total<0 or v_paid>v_total then raise exception 'Tax, discount or paid amount is invalid'; end if;
  if p_kind='sale' then
    insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
    values(p_store_id,'sale',p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by) returning * into v_invoice;
  else
    insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
    values(p_store_id,'purchase',p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by) returning * into v_invoice;
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    select * into v_product from public.pharmacy_products where id=(v_item->>'productId')::uuid and store_id=p_store_id for update;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and lower(unit_label)=lower(btrim(v_item->>'unitLabel')) for update;
    v_qty:=(v_item->>'quantity')::numeric;v_free:=coalesce((v_item->>'freeQuantity')::numeric,0);v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    v_price:=coalesce((v_item->>'unitPrice')::numeric,0);if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor);end if;
    v_tax_pct:=coalesce((v_item->>'taxPercent')::numeric,0);v_disc:=coalesce((v_item->>'discount')::numeric,0);v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
    values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,case when p_kind='purchase' then v_price else 0 end) returning * into v_line;
    v_location:=coalesce(nullif(v_item->>'locationId','')::uuid,v_product.default_location_id);v_mrp:=coalesce(nullif(v_item->>'salePrice','')::numeric,v_product.sale_price);
    insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
    values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,case when p_kind='purchase' then v_base_qty+v_free_base else v_base_qty end,case when p_kind='purchase' then v_free_base else 0 end,case when p_kind='purchase' and (v_base_qty+v_free_base)>0 then (v_qty*v_price)/(v_base_qty+v_free_base) else 0 end,v_mrp);
    if p_kind='purchase' then
      v_batch_text:=nullif(btrim(v_item->>'batchNumber'),'');v_mfg:=nullif(v_item->>'manufacturingDate','')::date;v_exp:=nullif(v_item->>'expiryDate','')::date;
      v_batch_id:=gen_random_uuid();v_stock_before:=0;v_stock_after:=v_base_qty+v_free_base;
      insert into public.pharmacy_batches(id,store_id,product_id,batch_number,manufacturing_date,expiry_date,quantity_on_hand_base,free_quantity_base,unit_cost,mrp_per_base,status,location_id,supplier_id,purchase_invoice_id,purchase_invoice_line_id,created_by)
      values(v_batch_id,p_store_id,v_product.id,v_batch_text,v_mfg,v_exp,v_stock_after,v_free_base,case when v_stock_after>0 then round((v_qty*v_price)/v_stock_after,6) else 0 end,v_mrp,case when v_exp is not null and v_exp<current_date then 'expired' else 'available' end,v_location,p_party_id,v_invoice.id,v_line.id,p_created_by);
      insert into public.pharmacy_invoice_batches(store_id,invoice_line_id,batch_id,movement_kind,quantity_base) values(p_store_id,v_line.id,v_batch_id,'purchase',v_stock_after);
      update public.inventory_items set total_stock=total_stock+v_stock_after,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,to_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,v_batch_id,'purchase',v_stock_after,v_stock_before,v_stock_after,v_location,'invoice',v_invoice.id,'Purchase receipt '||p_invoice_number,p_operation_key||':purchase:'||v_line.id,p_created_by);
    else
      v_remaining:=v_base_qty;v_cost_sum:=0;v_selected_batch:=nullif(v_item->>'batchId','')::uuid;
      for v_batch in select * from public.pharmacy_batches b where b.store_id=p_store_id and b.product_id=v_product.id and b.status='available' and b.quantity_on_hand_base>0 and (b.expiry_date is null or b.expiry_date>=current_date) and (v_selected_batch is null or b.id=v_selected_batch) order by b.expiry_date asc nulls last,b.created_at asc,b.id asc for update loop
        exit when v_remaining<=0;
        v_take:=least(v_remaining,v_batch.quantity_on_hand_base);v_stock_before:=v_batch.quantity_on_hand_base;v_stock_after:=v_stock_before-v_take;
        v_free_take:=case when v_stock_before>0 then round(least(v_batch.free_quantity_base,v_batch.free_quantity_base*v_take/v_stock_before),3) else 0 end;
        update public.pharmacy_batches set quantity_on_hand_base=v_stock_after,free_quantity_base=greatest(0,free_quantity_base-v_free_take),updated_at=now() where id=v_batch.id;
        update public.inventory_items set total_stock=total_stock-v_take,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id and total_stock>=v_take;
        if not found then raise exception 'Pharmacy stock ledger is inconsistent; refresh and recount stock'; end if;
        insert into public.pharmacy_invoice_batches(store_id,invoice_line_id,batch_id,movement_kind,quantity_base) values(p_store_id,v_line.id,v_batch.id,'sale',v_take);
        insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,from_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
        values(p_store_id,v_product.id,v_batch.id,'sale',v_take,v_stock_before,v_stock_after,v_batch.location_id,'invoice',v_invoice.id,'Pharmacy POS '||p_invoice_number,p_operation_key||':sale:'||v_line.id||':'||v_batch.id,p_created_by);
        v_remaining:=v_remaining-v_take;v_cost_sum:=v_cost_sum+v_take*v_batch.unit_cost;
      end loop;
      if v_remaining>0 then raise exception 'Insufficient eligible batch stock. Expired, recalled, blocked and quarantined stock cannot be sold'; end if;
      update public.invoice_lines set cost_price=case when v_qty>0 then round(v_cost_sum/v_qty,2) else 0 end where id=v_line.id;
      update public.pharmacy_invoice_lines set unit_cost_base=case when v_base_qty>0 then v_cost_sum/v_base_qty else 0 end where invoice_line_id=v_line.id;
    end if;
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,created_by) values(p_store_id,p_operation_key,p_kind,v_invoice.id,p_created_by);
  select i.* into v_invoice from public.invoices i where i.id=v_invoice.id and i.store_id=p_store_id;
  return v_invoice;
end $$;

create or replace function public.pharmacy_move_batch(p_store_id uuid,p_batch_id uuid,p_quantity numeric,p_location_id uuid,p_actor uuid,p_operation_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.pharmacy_batches; target_id uuid; moved uuid; before_qty numeric; after_qty numeric; free_moved numeric; prior public.pharmacy_operations;
begin
  if p_quantity<=0 or p_operation_key is null or btrim(p_operation_key)='' then raise exception 'Move quantity and retry-safe operation key are required'; end if;
  select * into prior from public.pharmacy_operations where store_id=p_store_id and operation_key=p_operation_key;
  if found then if prior.operation_type<>'move' then raise exception 'This operation key is already used'; end if;return jsonb_build_object('batch_id',prior.result_id,'quantity_base',p_quantity,'location_id',p_location_id,'idempotent',true);end if;
  select * into b from public.pharmacy_batches where id=p_batch_id and store_id=p_store_id for update;
  if not found then raise exception 'Batch not found in this shop'; end if;
  if p_quantity>b.quantity_on_hand_base then raise exception 'Move quantity exceeds batch stock'; end if;
  if p_location_id is not null and not exists(select 1 from public.pharmacy_shelves where id=p_location_id and store_id=p_store_id and active) then raise exception 'Destination shelf does not belong to this shop'; end if;
  before_qty:=b.quantity_on_hand_base;
  if p_quantity=before_qty then
    update public.pharmacy_batches set location_id=p_location_id,updated_at=now() where id=b.id;
    target_id:=b.id;
  else
    after_qty:=before_qty-p_quantity;
    free_moved:=round(least(b.free_quantity_base,b.free_quantity_base*p_quantity/nullif(before_qty,0)),3);
    update public.pharmacy_batches set quantity_on_hand_base=after_qty,free_quantity_base=greatest(0,free_quantity_base-free_moved),updated_at=now() where id=b.id;
    moved:=gen_random_uuid();
    insert into public.pharmacy_batches(id,store_id,product_id,batch_number,manufacturing_date,expiry_date,quantity_on_hand_base,free_quantity_base,unit_cost,mrp_per_base,status,location_id,supplier_id,purchase_invoice_id,purchase_invoice_line_id,created_by)
    values(moved,b.store_id,b.product_id,b.batch_number,b.manufacturing_date,b.expiry_date,p_quantity,free_moved,b.unit_cost,b.mrp_per_base,b.status,p_location_id,b.supplier_id,b.purchase_invoice_id,b.purchase_invoice_line_id,p_actor);
    target_id:=moved;
  end if;
  insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,from_location_id,to_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
  values(p_store_id,b.product_id,target_id,'shelf_move',p_quantity,b.quantity_on_hand_base,b.quantity_on_hand_base,b.location_id,p_location_id,'batch',b.id,'Shelf movement',p_operation_key,p_actor);
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,result_id,created_by) values(p_store_id,p_operation_key,'move',target_id,p_actor);
  return jsonb_build_object('batch_id',target_id,'quantity_base',p_quantity,'location_id',p_location_id);
end $$;

-- The following two financial/stock workflows are deliberately blocked until their
-- batch-aware RPC is used by the Pharmacy screen. Generic EMS forms remain unchanged.
commit;

revoke all on function public.pharmacy_save_product(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_save_product(uuid,uuid,jsonb,jsonb,uuid) to service_role;
revoke all on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) to service_role;
revoke all on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) to service_role;

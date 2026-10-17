-- Pharmacy medicine catalog fields and per-shop manufacturer directory.
-- Shelves are location labels only; aggregate stock remains unchanged.
begin;
alter table public.pharmacy_products
  add column if not exists pack_size text,
  add column if not exists wholesale_price numeric(14,2) not null default 0 check(wholesale_price>=0);
create table if not exists public.pharmacy_manufacturers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists pharmacy_manufacturers_store_name_idx on public.pharmacy_manufacturers(store_id,lower(name));
update public.pharmacy_products set manufacturer=btrim(brand)
  where (manufacturer is null or btrim(manufacturer)='') and nullif(btrim(brand),'') is not null;
insert into public.pharmacy_manufacturers(store_id,name)
  select distinct on (store_id,lower(btrim(manufacturer))) store_id,btrim(manufacturer)
  from public.pharmacy_products where nullif(btrim(manufacturer),'') is not null
  order by store_id,lower(btrim(manufacturer)),btrim(manufacturer)
  on conflict do nothing;
revoke all on public.pharmacy_manufacturers from public,anon,authenticated;
grant all on public.pharmacy_manufacturers to service_role;
alter table public.pharmacy_manufacturers enable row level security;
-- The previous aggregate guard preserved old shelf IDs when a user cleared one.
-- Stock is still aggregate; allow the optional display location to be cleared.
create or replace function public.pharmacy_enforce_aggregate_product()
returns trigger language plpgsql set search_path=public as $$
begin
  new.tracks_batch:=false;
  new.tracks_expiry:=false;
  return new;
end $$;
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
    insert into public.pharmacy_products(id,store_id,inventory_item_id,name,generic_name,brand,strength,dosage_form,category,manufacturer,pack_size,supplier_id,barcode,base_unit,purchase_price,sale_price,wholesale_price,reorder_threshold,default_location_id,prescription_required,tracks_batch,tracks_expiry,description,active,created_by)
    values(v_product_id,p_store_id,v_item_id,v_name,nullif(btrim(p_product->>'generic_name'),''),nullif(btrim(p_product->>'brand'),''),nullif(btrim(p_product->>'strength'),''),coalesce(nullif(p_product->>'dosage_form',''),'other'),coalesce(nullif(p_product->>'category',''),'Medicine'),nullif(btrim(p_product->>'manufacturer'),''),nullif(btrim(p_product->>'pack_size'),''),nullif(p_product->>'supplier_id','')::uuid,nullif(btrim(p_product->>'barcode'),''),v_base,coalesce((p_product->>'purchase_price')::numeric,0),coalesce((p_product->>'sale_price')::numeric,0),coalesce((p_product->>'wholesale_price')::numeric,0),coalesce((p_product->>'reorder_threshold')::numeric,5),nullif(p_product->>'default_location_id','')::uuid,coalesce((p_product->>'prescription_required')::boolean,false),coalesce((p_product->>'tracks_batch')::boolean,true),coalesce((p_product->>'tracks_expiry')::boolean,true),nullif(btrim(p_product->>'description'),''),true,p_actor) returning * into v_product;
  else
    select * into v_product from public.pharmacy_products where id=p_product_id and store_id=p_store_id for update;
    if not found then raise exception 'Medicine was not found in this shop'; end if;
    select * into v_item from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
    if not found then raise exception 'Linked inventory record was not found'; end if;
    if v_sku='' then v_sku:=v_item.item_code; end if;
    if (v_product.base_unit<>v_base or v_item.item_code<>v_sku) and (exists(select 1 from public.pharmacy_batches where product_id=v_product.id and quantity_on_hand_base>0) or exists(select 1 from public.pharmacy_invoice_lines where product_id=v_product.id)) then raise exception 'SKU and base unit cannot be changed after batch or invoice history exists'; end if;
    update public.inventory_items set item_code=v_sku,description=v_desc,unit=v_base,sale_price=coalesce((p_product->>'sale_price')::numeric,0),category=coalesce(nullif(p_product->>'category',''),'Medicine'),active=true,updated_at=now() where id=v_item.id;
    update public.pharmacy_products set name=v_name,generic_name=nullif(btrim(p_product->>'generic_name'),''),brand=nullif(btrim(p_product->>'brand'),''),strength=nullif(btrim(p_product->>'strength'),''),dosage_form=coalesce(nullif(p_product->>'dosage_form',''),'other'),category=coalesce(nullif(p_product->>'category',''),'Medicine'),manufacturer=nullif(btrim(p_product->>'manufacturer'),''),pack_size=nullif(btrim(p_product->>'pack_size'),''),supplier_id=nullif(p_product->>'supplier_id','')::uuid,barcode=nullif(btrim(p_product->>'barcode'),''),base_unit=v_base,purchase_price=coalesce((p_product->>'purchase_price')::numeric,0),sale_price=coalesce((p_product->>'sale_price')::numeric,0),wholesale_price=coalesce((p_product->>'wholesale_price')::numeric,0),reorder_threshold=coalesce((p_product->>'reorder_threshold')::numeric,5),default_location_id=nullif(p_product->>'default_location_id','')::uuid,prescription_required=coalesce((p_product->>'prescription_required')::boolean,false),tracks_batch=coalesce((p_product->>'tracks_batch')::boolean,true),tracks_expiry=coalesce((p_product->>'tracks_expiry')::boolean,true),description=nullif(btrim(p_product->>'description'),''),updated_at=now() where id=v_product.id returning * into v_product;
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
commit;

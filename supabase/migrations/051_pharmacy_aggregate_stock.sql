-- Pharmacy aggregate-stock model. Existing batch records are retained as legacy
-- history; new receipts and sales use inventory_items.total_stock plus weighted cost.
begin;

alter table public.pharmacy_products
  add column if not exists average_cost_base numeric(14,6) not null default 0
  check (average_cost_base >= 0);

-- Preserve historical cost information while moving current stock to one product-level balance.
update public.pharmacy_products p
set average_cost_base = coalesce(
  (select round(sum(b.quantity_on_hand_base * b.unit_cost) / nullif(sum(b.quantity_on_hand_base),0),6)
   from public.pharmacy_batches b where b.store_id=p.store_id and b.product_id=p.id and b.quantity_on_hand_base>0),
  p.purchase_price,0
);
update public.pharmacy_products set tracks_batch=false,tracks_expiry=false;

-- Keep legacy shelf references intact for record compatibility, but never expose
-- them in the aggregate-stock workflow or permit batch/expiry tracking to return.
create or replace function public.pharmacy_enforce_aggregate_product()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' and new.default_location_id is null then
    new.default_location_id:=old.default_location_id;
  end if;
  new.tracks_batch:=false;
  new.tracks_expiry:=false;
  return new;
end $$;
revoke all on function public.pharmacy_enforce_aggregate_product() from public,anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='pharmacy_aggregate_product_guard' and tgrelid='public.pharmacy_products'::regclass and not tgisinternal) then
    execute 'create trigger pharmacy_aggregate_product_guard before insert or update on public.pharmacy_products for each row execute function public.pharmacy_enforce_aggregate_product()';
  end if;
end $$;

create or replace function public.pharmacy_seed_average_cost()
returns trigger language plpgsql set search_path=public as $$
declare v_stock numeric;
begin
  if tg_op='INSERT' then
    if coalesce(new.average_cost_base,0)=0 and coalesce(new.purchase_price,0)>0 then new.average_cost_base:=new.purchase_price; end if;
  elsif new.purchase_price is distinct from old.purchase_price then
    select total_stock into v_stock from public.inventory_items where id=new.inventory_item_id and store_id=new.store_id;
    if coalesce(v_stock,0)<=0 then new.average_cost_base:=new.purchase_price; end if;
  end if;
  return new;
end $$;
drop trigger if exists pharmacy_products_seed_average_cost on public.pharmacy_products;
create trigger pharmacy_products_seed_average_cost
before insert or update of purchase_price on public.pharmacy_products
for each row execute function public.pharmacy_seed_average_cost();
revoke all on function public.pharmacy_seed_average_cost() from public,anon,authenticated;

create or replace function public.pharmacy_post_invoice(
  p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method text,p_transaction_id text,p_notes text,
  p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb,p_operation_key text,p_allow_price_override boolean default false)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_raw jsonb; v_product public.pharmacy_products; v_unit public.pharmacy_product_units;
  v_inventory public.inventory_items; v_line public.invoice_lines; v_operation public.pharmacy_operations;
  v_qty numeric; v_free numeric; v_factor numeric; v_base_qty numeric; v_free_base numeric; v_received numeric;
  v_price numeric; v_tax_pct numeric; v_disc numeric; v_lsub numeric; v_ltax numeric;
  v_subtotal numeric:=0; v_line_tax numeric:=0; v_line_disc numeric:=0; v_tax numeric; v_total numeric; v_paid numeric;
  v_stock_before numeric; v_stock_after numeric; v_average_cost numeric; v_line_cost numeric; v_mrp numeric;
begin
  if p_kind not in ('sale','purchase') then raise exception 'Pharmacy invoice type is invalid'; end if;
  if p_operation_key is null or btrim(p_operation_key)='' then raise exception 'A retry-safe operation key is required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>200 then raise exception 'Add 1 to 200 Pharmacy invoice lines'; end if;
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
  if coalesce(p_tax_percent,0)<0 or coalesce(p_discount,0)<0 or coalesce(p_paid_amount,0)<0 then raise exception 'Invoice tax, discount or paid amount is invalid'; end if;

  -- Validate all lines and calculate the invoice before writing any stock.
  for v_raw in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce(nullif(v_raw->>'quantity','')::numeric,0);v_free:=coalesce(nullif(v_raw->>'freeQuantity','')::numeric,0);
    if v_qty<=0 or v_free<0 then raise exception 'Line quantities must be positive and bonus quantities cannot be negative'; end if;
    select * into v_product from public.pharmacy_products where id=(v_raw->>'productId')::uuid and store_id=p_store_id and active for update;
    if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_raw->>'unitLabel')) for update;
    if not found or (p_kind='sale' and not v_unit.can_sell) or (p_kind='purchase' and not v_unit.can_purchase) then raise exception 'Selected unit is not enabled for this operation'; end if;
    if not v_unit.allow_fractional and (v_qty<>trunc(v_qty) or v_free<>trunc(v_free)) then raise exception 'This medicine unit does not allow fractional quantities'; end if;
    v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    if v_factor<=0 or v_base_qty<=0 then raise exception 'Converted quantity must be greater than zero'; end if;
    v_price:=coalesce(nullif(v_raw->>'unitPrice','')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    if v_price<0 then raise exception 'Price cannot be negative'; end if;
    v_tax_pct:=coalesce(nullif(v_raw->>'taxPercent','')::numeric,0);v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    if v_tax_pct<0 or v_disc<0 then raise exception 'Tax and discount cannot be negative'; end if;
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    if v_disc>v_lsub+v_ltax then raise exception 'Line discount cannot exceed its value'; end if;
    v_subtotal:=v_subtotal+v_lsub;v_line_tax:=v_line_tax+v_ltax;v_line_disc:=v_line_disc+v_disc;
  end loop;
  v_tax:=round(v_subtotal*coalesce(p_tax_percent,0)/100,2);
  v_total:=round(v_subtotal+v_line_tax+v_tax-v_line_disc-coalesce(p_discount,0),2);v_paid:=coalesce(p_paid_amount,0);
  if v_total<0 or v_paid>v_total then raise exception 'Invoice tax, discount or paid amount is invalid'; end if;

  insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
  values(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,
    round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by)
  returning * into v_invoice;

  for v_raw in select value from jsonb_array_elements(p_lines) loop
    select * into v_product from public.pharmacy_products where id=(v_raw->>'productId')::uuid and store_id=p_store_id for update;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_raw->>'unitLabel')) for update;
    select * into v_inventory from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
    if not found then raise exception 'Linked Pharmacy inventory record was not found'; end if;
    v_qty:=(v_raw->>'quantity')::numeric;v_free:=coalesce(nullif(v_raw->>'freeQuantity','')::numeric,0);v_factor:=v_unit.factor_to_base;
    v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    v_price:=coalesce(nullif(v_raw->>'unitPrice','')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    v_tax_pct:=coalesce(nullif(v_raw->>'taxPercent','')::numeric,0);v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    v_mrp:=coalesce(nullif(v_raw->>'salePrice','')::numeric,v_product.sale_price);
    if v_mrp<0 then raise exception 'MRP must be non-negative'; end if;
    v_stock_before:=coalesce(v_inventory.total_stock,0);

    if p_kind='sale' then
      if v_stock_before+0.0001<v_base_qty then raise exception 'Insufficient Pharmacy stock; refresh and retry'; end if;
      v_average_cost:=greatest(0,coalesce(v_product.average_cost_base,v_product.purchase_price,0));
      v_line_cost:=round(v_average_cost*v_factor,2);v_stock_after:=round(v_stock_before-v_base_qty,3);
      insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
      values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,v_line_cost) returning * into v_line;
      insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
      values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,v_base_qty,0,v_average_cost,v_mrp);
      update public.inventory_items set total_stock=v_stock_after,updated_at=now() where id=v_inventory.id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,null,'sale',v_base_qty,v_stock_before,v_stock_after,'invoice',v_invoice.id,'Pharmacy POS '||v_invoice.invoice_number,p_operation_key||':sale:'||v_line.id,p_created_by);
    else
      v_received:=round(v_base_qty+v_free_base,3);v_stock_after:=round(v_stock_before+v_received,3);
      v_average_cost:=case when v_stock_after>0 then round((v_stock_before*greatest(0,coalesce(v_product.average_cost_base,v_product.purchase_price,0))+v_qty*v_price)/v_stock_after,6) else 0 end;
      insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
      values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,v_price) returning * into v_line;
      insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
      values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,v_received,v_free_base,case when v_received>0 then round(v_qty*v_price/v_received,6) else 0 end,v_mrp);
      update public.pharmacy_products set average_cost_base=v_average_cost,updated_at=now() where id=v_product.id and store_id=p_store_id;
      update public.inventory_items set total_stock=v_stock_after,updated_at=now() where id=v_inventory.id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,null,'purchase',v_received,v_stock_before,v_stock_after,'invoice',v_invoice.id,'Purchase receipt '||v_invoice.invoice_number,p_operation_key||':purchase:'||v_line.id,p_created_by);
    end if;
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,created_by)
  values(p_store_id,p_operation_key,p_kind,v_invoice.id,p_created_by);
  select * into v_invoice from public.invoices where id=v_invoice.id and store_id=p_store_id;
  return v_invoice;
end $$;

create or replace function public.pharmacy_intake_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices;v_operation public.pharmacy_operations;v_return public.pharmacy_returns;v_raw jsonb;
  v_line_id uuid;v_product_id uuid;v_qty numeric;v_sold numeric;v_returned numeric;v_stock numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned Pharmacy lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>'return' or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then raise exception 'Original invoice is not a Pharmacy sale in this shop'; end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;
  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,idempotency_key,created_by)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),'return',0,'none','quarantined',btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by)
  returning * into v_return;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    if v_line_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line and positive quantity'; end if;
    select pil.product_id,pil.quantity_base into v_product_id,v_sold
      from public.pharmacy_invoice_lines pil join public.invoice_lines il on il.id=pil.invoice_line_id
      where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id and il.invoice_id=p_invoice_id;
    if not found then raise exception 'Return line is not linked to the original Pharmacy sale'; end if;
    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri join public.pharmacy_returns pr on pr.id=ri.return_id
      where pr.store_id=p_store_id and pr.invoice_id=p_invoice_id and ri.invoice_line_id=v_line_id;
    if v_qty>v_sold-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this Pharmacy sale'; end if;
    select total_stock into v_stock from public.inventory_items where id=(select inventory_item_id from public.pharmacy_products where id=v_product_id and store_id=p_store_id) and store_id=p_store_id;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,null,v_qty,'quarantined',btrim(p_reason),0,false);
    insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
    values(p_store_id,v_product_id,null,'customer_return_intake',v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,btrim(p_reason),p_idempotency_key||':intake:'||v_line_id,p_created_by);
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,'return',p_invoice_id,v_return.id,p_created_by);
  return to_jsonb(v_return);
end $$;

create or replace function public.pharmacy_release_return(
  p_store_id uuid,p_return_id uuid,p_return_item_id uuid,p_package_sealed boolean,p_inspection_notes text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Pharmacy customer returns remain quarantined; aggregate stock release is not enabled under the approved policy';
end $$;

-- Keep the legacy signature for compatibility while making shelf/batch movement inert.
create or replace function public.pharmacy_move_batch(
  p_store_id uuid,p_batch_id uuid,p_quantity numeric,p_location_id uuid,p_actor uuid,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Batch and shelf movement workflows have been retired; Pharmacy stock is aggregate-only';
end $$;
revoke all on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) to service_role;

revoke all on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) to service_role;
revoke all on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) to service_role;
revoke all on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) to service_role;

commit;

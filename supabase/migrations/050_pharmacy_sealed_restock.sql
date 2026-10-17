-- Pharmacy return inspection/release. Saleable stock is restored only after
-- an authorized sealed-package inspection, to the original eligible batch.
begin;

alter table public.pharmacy_return_items
  add column if not exists package_sealed boolean not null default false,
  add column if not exists inspection_notes text,
  add column if not exists inspected_by uuid,
  add column if not exists inspected_at timestamptz;

create or replace function public.pharmacy_release_return(
  p_store_id uuid,p_return_id uuid,p_return_item_id uuid,p_package_sealed boolean,
  p_inspection_notes text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item public.pharmacy_return_items; v_return public.pharmacy_returns; v_batch public.pharmacy_batches;
  v_product public.pharmacy_products; v_before numeric; v_after numeric;
begin
  if p_package_sealed is not true then raise exception 'Only an inspected, factory-sealed return can be released to saleable stock'; end if;
  select * into v_item from public.pharmacy_return_items where id=p_return_item_id and return_id=p_return_id and store_id=p_store_id for update;
  if not found then raise exception 'Pharmacy return item was not found in this shop'; end if;
  if v_item.restocked then return jsonb_build_object('id',v_item.id,'restocked',true,'idempotent',true,'quantity_base',v_item.quantity_base); end if;
  if v_item.condition<>'quarantined' or v_item.batch_id is null then raise exception 'Only a quarantined, batch-linked return item can be inspected'; end if;
  select * into v_return from public.pharmacy_returns where id=v_item.return_id and store_id=p_store_id;
  if not found then raise exception 'Pharmacy return record was not found in this shop'; end if;
  select * into v_batch from public.pharmacy_batches where id=v_item.batch_id and store_id=p_store_id and product_id=v_item.product_id for update;
  if not found then raise exception 'Original batch was not found in this shop'; end if;
  if v_batch.status<>'available' then raise exception 'Original batch is blocked, recalled, or quarantined and cannot receive returned stock'; end if;
  if v_batch.expiry_date is not null and v_batch.expiry_date<current_date then raise exception 'Expired batch cannot receive returned stock'; end if;
  select * into v_product from public.pharmacy_products where id=v_item.product_id and store_id=p_store_id and active for update;
  if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
  select total_stock into v_before from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
  if not found then raise exception 'Linked inventory record was not found'; end if;
  v_after:=v_before+v_item.quantity_base;
  update public.pharmacy_batches set quantity_on_hand_base=quantity_on_hand_base+v_item.quantity_base,updated_at=now() where id=v_batch.id;
  update public.inventory_items set total_stock=total_stock+v_item.quantity_base,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id;
  update public.pharmacy_return_items set condition='sellable',restocked=true,package_sealed=true,
    inspection_notes=nullif(btrim(p_inspection_notes),''),inspected_by=p_actor,inspected_at=now()
  where id=v_item.id and store_id=p_store_id and restocked=false;
  insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
  values(p_store_id,v_product.id,v_batch.id,'customer_return_restock',v_item.quantity_base,v_before,v_after,'pharmacy_return',v_return.id,
    'Sealed package inspected and released from quarantine','return-restock:'||v_item.id,p_actor);
  return jsonb_build_object('id',v_item.id,'return_id',v_return.id,'product_id',v_product.id,'batch_id',v_batch.id,
    'quantity_base',v_item.quantity_base,'restocked',true,'package_sealed',true,'inspected_by',p_actor,'inspected_at',now());
end $$;

revoke all on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) to service_role;
commit;

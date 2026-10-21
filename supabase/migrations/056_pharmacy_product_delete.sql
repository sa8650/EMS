-- Safe removal for unused Pharmacy catalog entries only.
-- Medicines with stock or a posted history must be deactivated instead.
begin;

create or replace function public.pharmacy_delete_product(p_store_id uuid,p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_product record;
begin
  select p.id,p.store_id,p.inventory_item_id,p.name,i.item_code as sku,i.total_stock
    into v_product
    from public.pharmacy_products p
    join public.inventory_items i on i.id=p.inventory_item_id and i.store_id=p.store_id
    where p.id=p_product_id and p.store_id=p_store_id
    for update of p,i;
  if not found then raise exception 'Medicine was not found in this shop'; end if;
  if abs(coalesce(v_product.total_stock,0))>0.0001 then
    raise exception 'Medicine has on-hand stock; deactivate it instead of deleting it';
  end if;
  if exists(
       select 1 from public.invoice_lines il join public.invoices inv on inv.id=il.invoice_id
       where inv.store_id=p_store_id and il.item_id=v_product.inventory_item_id
     )
     or exists(select 1 from public.pharmacy_invoice_lines where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_stock_movements where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_batches where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_return_items where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.inventory_stock_movements where store_id=p_store_id and item_id=v_product.inventory_item_id)
  then
    raise exception 'Medicine has stock or transaction history; deactivate it to keep the audit record';
  end if;

  delete from public.pharmacy_alerts
    where store_id=p_store_id and alert_key='low-stock:'||p_product_id::text;
  delete from public.pharmacy_products where id=p_product_id and store_id=p_store_id;
  delete from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id;
  return jsonb_build_object('id',v_product.id,'name',v_product.name,'sku',v_product.sku);
end $$;

revoke all on function public.pharmacy_delete_product(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_delete_product(uuid,uuid) to service_role;

commit;

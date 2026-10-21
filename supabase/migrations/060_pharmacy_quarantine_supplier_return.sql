-- Existing Supabase installs: apply after 059. Saleable stock is untouched
-- when a quarantine item (customer return) is shipped to a supplier.
alter table public.pharmacy_supplier_return_lines add column if not exists quarantine_item_id uuid references public.pharmacy_return_items(id) on delete restrict;
create index if not exists pharmacy_supplier_return_lines_quarantine_idx on public.pharmacy_supplier_return_lines(store_id,quarantine_item_id);
create or replace function public.pharmacy_post_supplier_return(
 p_store_id uuid,p_invoice_id uuid,p_return_number text,p_return_date date,p_reason text,p_notes text,
 p_settlement_method text,p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns public.pharmacy_supplier_return_headers language plpgsql security definer set search_path=public as $$
declare v_invoice record;v_prior public.pharmacy_supplier_return_headers%rowtype;v_return public.pharmacy_supplier_return_headers%rowtype;
 v_item jsonb;v_line record;v_prepared jsonb:='[]'::jsonb;v_seen uuid[]:='{}'::uuid[];
 v_quarantine_id uuid;v_quarantine record;v_quarantine_used numeric(16,3);v_line_id uuid;v_qty numeric(16,3);v_previous numeric(16,3);v_previous_amount numeric(14,2);v_gross_lines numeric(14,2);v_net_total numeric(14,2);v_net_line numeric(14,2);v_amount numeric(14,2):=0;v_line_amount numeric(14,2);v_due numeric(14,2);v_before numeric(16,3);
begin
 if p_store_id is null or p_invoice_id is null or p_idempotency_key is null or p_reason is null or btrim(p_reason)='' or p_return_date is null
    or p_settlement_method not in ('refund','credit') or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Valid purchase, reason, settlement and 1 to 50 return items are required';end if;
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select i.* into v_invoice from public.invoices i join public.pharmacy_operations o on o.invoice_id=i.id and o.store_id=i.store_id and o.operation_type='purchase'
 where i.id=p_invoice_id and i.store_id=p_store_id and i.kind='purchase' for update of i;
 if not found then raise exception 'Original Pharmacy purchase was not found in this shop';end if;
 -- Another request may have committed the same operation while we waited on the invoice lock.
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select coalesce(sum(line_total),0) into v_gross_lines from public.invoice_lines where invoice_id=p_invoice_id;
 v_net_total:=round(v_invoice.subtotal+coalesce(v_invoice.line_tax_amount,0)+v_invoice.tax_amount-v_invoice.discount-coalesce(v_invoice.line_discount_amount,0),2);
 for v_item in select element from jsonb_array_elements(p_items) as j(element) loop
  v_line_id:=(v_item->>'invoice_line_id')::uuid;v_qty:=(v_item->>'quantity_base')::numeric;v_quarantine_id:=nullif(v_item->>'quarantine_item_id','')::uuid;
  if v_line_id is null or v_line_id=any(v_seen) or v_qty is null or v_qty<=0 or v_qty<>round(v_qty,3) then raise exception 'Return line quantities must be unique, positive and at most three decimal places';end if;
  v_seen:=array_append(v_seen,v_line_id);
  select l.line_total,x.product_id,x.quantity_base,p.inventory_item_id into v_line from public.invoice_lines l
    join public.pharmacy_invoice_lines x on x.invoice_line_id=l.id and x.store_id=p_store_id
    join public.pharmacy_products p on p.id=x.product_id and p.store_id=p_store_id and p.inventory_item_id=l.item_id
    where l.id=v_line_id and l.invoice_id=p_invoice_id;
  if not found then raise exception 'Return item does not belong to this Pharmacy purchase';end if;
  select coalesce(sum(quantity_base),0),coalesce(sum(amount),0) into v_previous,v_previous_amount from public.pharmacy_supplier_return_lines where store_id=p_store_id and invoice_line_id=v_line_id;
  if v_qty>v_line.quantity_base-v_previous then raise exception 'Returned quantity exceeds the original purchase quantity';end if;
  if v_quarantine_id is not null then
   select id,quantity_base into v_quarantine from public.pharmacy_return_items where id=v_quarantine_id and store_id=p_store_id and product_id=v_line.product_id and not restocked and condition in ('damaged','defective','expired','quarantined','recalled') for update;
   if not found then raise exception 'This quarantine item is not available for this medicine';end if;
   select coalesce(sum(quantity_base),0) into v_quarantine_used from public.pharmacy_supplier_return_lines where store_id=p_store_id and quarantine_item_id=v_quarantine_id;
   if v_qty>v_quarantine.quantity_base-v_quarantine_used then raise exception 'Returned quantity exceeds the available quarantined quantity';end if;
  end if;
  v_net_line:=case when v_gross_lines>0 then round(v_net_total*v_line.line_total/v_gross_lines,2) else 0 end;
  v_line_amount:=greatest(0,least(v_net_line-v_previous_amount,round(v_net_line*v_qty/v_line.quantity_base,2)));v_amount:=v_amount+v_line_amount;
  v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('line',v_line_id,'product',v_line.product_id,'item',v_line.inventory_item_id,'qty',v_qty,'amount',v_line_amount,'quarantine',v_quarantine_id));
 end loop;
 v_due:=least(greatest(v_invoice.total_due,0),v_amount);
 insert into public.pharmacy_supplier_return_headers(store_id,purchase_invoice_id,supplier_id,return_number,return_date,reason,notes,settlement_method,amount,due_reduction,idempotency_key,created_by)
 values(p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,p_return_date,btrim(p_reason),p_notes,p_settlement_method,v_amount,v_due,p_idempotency_key,p_created_by) returning * into v_return;
 for v_item in select element from jsonb_array_elements(v_prepared) as j(element) loop
  v_qty:=(v_item->>'qty')::numeric;
  select total_stock into v_before from public.inventory_items where id=(v_item->>'item')::uuid and store_id=p_store_id for update;
  if v_before is null or ((v_item->>'quarantine') is null and v_before<v_qty) then raise exception 'Not enough shop stock to return this medicine';end if;
  if (v_item->>'quarantine') is null then
    update public.inventory_items set total_stock=total_stock-v_qty,updated_at=now() where id=(v_item->>'item')::uuid and store_id=p_store_id;
  else
    select id,quantity_base into v_quarantine from public.pharmacy_return_items where id=(v_item->>'quarantine')::uuid and store_id=p_store_id and product_id=(v_item->>'product')::uuid and not restocked and condition in ('damaged','defective','expired','quarantined','recalled') for update;
    if not found then raise exception 'Quarantine changed while posting this supplier return';end if;
    select coalesce(sum(quantity_base),0) into v_quarantine_used from public.pharmacy_supplier_return_lines where store_id=p_store_id and quarantine_item_id=v_quarantine.id;
    if v_qty>v_quarantine.quantity_base-v_quarantine_used then raise exception 'Returned quantity exceeds the available quarantined quantity';end if;
  end if;
  insert into public.pharmacy_supplier_return_lines(return_id,store_id,invoice_line_id,product_id,quantity_base,amount,quarantine_item_id)
   values(v_return.id,p_store_id,(v_item->>'line')::uuid,(v_item->>'product')::uuid,v_qty,(v_item->>'amount')::numeric,(v_item->>'quarantine')::uuid);
  insert into public.pharmacy_stock_movements(store_id,product_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
   values(p_store_id,(v_item->>'product')::uuid,case when (v_item->>'quarantine') is null then 'supplier_return' else 'supplier_return_quarantine' end,v_qty,v_before,case when (v_item->>'quarantine') is null then v_before-v_qty else v_before end,'supplier_return',v_return.id,v_return.reason,p_idempotency_key||':'||(v_item->>'line'),p_created_by);
 end loop;
 update public.invoices set total_due=greatest(0,total_due-v_due),updated_at=now() where id=p_invoice_id and store_id=p_store_id;
 return v_return;
end $$;
revoke all on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) to service_role;

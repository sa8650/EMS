-- Safe Pharmacy customer-return intake. Records physical receipt in quarantine only;
-- deliberately does not refund, alter dues, or add units back to saleable stock.
begin;

create or replace function public.pharmacy_intake_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_operation public.pharmacy_operations; v_return public.pharmacy_returns;
  v_raw jsonb; v_line_id uuid; v_batch_id uuid; v_product_id uuid; v_qty numeric; v_sold numeric; v_returned numeric; v_stock numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned batch lines'; end if;
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
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;v_batch_id:=nullif(v_raw->>'batch_id','')::uuid;v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    if v_line_id is null or v_batch_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line, source batch and positive quantity'; end if;
    select pil.product_id into v_product_id from public.pharmacy_invoice_lines pil join public.invoice_lines il on il.id=pil.invoice_line_id join public.pharmacy_invoice_batches pib on pib.invoice_line_id=il.id and pib.batch_id=v_batch_id and pib.movement_kind='sale' where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id and il.invoice_id=p_invoice_id;
    if not found then raise exception 'Returned batch is not linked to the original Pharmacy sale'; end if;
    select coalesce(sum(quantity_base),0) into v_sold from public.pharmacy_invoice_batches where store_id=p_store_id and invoice_line_id=v_line_id and batch_id=v_batch_id and movement_kind='sale';
    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri join public.pharmacy_returns pr on pr.id=ri.return_id where pr.store_id=p_store_id and pr.invoice_id=p_invoice_id and ri.invoice_line_id=v_line_id and ri.batch_id=v_batch_id;
    if v_qty>v_sold-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this sold batch'; end if;
    select ii.total_stock into v_stock from public.pharmacy_products pp join public.inventory_items ii on ii.id=pp.inventory_item_id where pp.id=v_product_id and pp.store_id=p_store_id;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,v_batch_id,v_qty,'quarantined',btrim(p_reason),0,false);
    insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
    values(p_store_id,v_product_id,v_batch_id,'customer_return_intake',v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,btrim(p_reason),p_idempotency_key||':intake:'||v_line_id||':'||v_batch_id,p_created_by);
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,'return',p_invoice_id,v_return.id,p_created_by);
  return to_jsonb(v_return);
end $$;

revoke all on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) to service_role;
commit;

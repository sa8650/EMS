-- 054: Pharmacy returns & exchanges follow the Electronics console model.
--  * Each returned line keeps its own reason, reason note, condition and penalty.
--  * Conditions: sellable (restock), damaged and defective (quarantine, no restock).
--  * Penalty / deduction reduces the refund for returns (never below zero).
--  * pharmacy_returns.amount = gross returned value; penalty_amount; refund_amount = net refund.
begin;

alter table public.pharmacy_return_items
  add column if not exists reason_note text,
  add column if not exists penalty numeric(14,2) not null default 0 check (penalty >= 0);

alter table public.pharmacy_return_items drop constraint if exists pharmacy_return_items_condition_check;
alter table public.pharmacy_return_items
  add constraint pharmacy_return_items_condition_check
  check (condition in ('sellable','damaged','defective','quarantined','expired'));

alter table public.pharmacy_returns
  add column if not exists penalty_amount numeric(14,2) not null default 0 check (penalty_amount >= 0),
  add column if not exists refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0);

-- Function signature is unchanged. p_items now carries per-line fields:
-- {invoice_line_id, quantity_base, condition: good|damaged|defective, reason, reason_note, penalty}
create or replace function public.pharmacy_post_return_exchange(
  p_store_id uuid,p_invoice_id uuid,p_kind text,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb,p_new_items jsonb,p_refund_method text,p_payment_method text,p_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_operation public.pharmacy_operations; v_return public.pharmacy_returns;
  v_raw jsonb; v_line_id uuid; v_qty numeric; v_condition text; v_il public.invoice_lines;
  v_product_id uuid; v_sold_base numeric; v_returned numeric; v_stock numeric; v_amount numeric;
  v_penalty numeric; v_penalty_total numeric:=0; v_line_reason text; v_line_note text;
  v_returned_total numeric:=0; v_new_total numeric:=0; v_new_qty_base numeric; v_factor numeric; v_price numeric; v_line_amount numeric;
  v_unit_label text; v_new_product uuid; v_diff numeric; v_settlement text; v_refund numeric:=0;
  v_restocked boolean:=false; v_quarantined boolean:=false; v_disp text;
  v_refund_method text; v_payment_method text;
begin
  if p_kind not in ('return','exchange') then raise exception 'Unknown return type'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned Pharmacy lines'; end if;
  if p_kind='exchange' and (jsonb_typeof(p_new_items)<>'array' or jsonb_array_length(p_new_items)=0 or jsonb_array_length(p_new_items)>100) then
    raise exception 'Add 1 to 100 replacement medicines for an exchange';
  end if;
  v_refund_method:=lower(coalesce(nullif(btrim(p_refund_method),''),'none'));
  v_payment_method:=lower(coalesce(nullif(btrim(p_payment_method),''),'none'));
  if v_refund_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid refund method'; end if;
  if v_payment_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid payment method'; end if;

  -- Idempotent replay: same key returns the stored record.
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;

  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then
    raise exception 'Original invoice is not a Pharmacy sale in this shop';
  end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;

  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,
    idempotency_key,created_by,settlement_type,new_items_total,difference_amount,transaction_id,penalty_amount,refund_amount)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),p_kind,0,'none','quarantined',
    btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by,'none',0,0,nullif(btrim(p_transaction_id),''),0,0)
  returning * into v_return;

  -- 1) Returned medicines: each line's condition decides restock or quarantine.
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;
    v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    v_condition:=lower(coalesce(nullif(btrim(v_raw->>'condition'),''),'good'));
    if v_condition='sellable' then v_condition:='good'; end if;
    v_line_reason:=coalesce(nullif(btrim(v_raw->>'reason'),''),btrim(p_reason));
    v_line_note:=nullif(btrim(v_raw->>'reason_note'),'');
    v_penalty:=case when p_kind='return' then round(greatest(0,coalesce((v_raw->>'penalty')::numeric,0)),2) else 0 end;
    if v_line_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line and a positive quantity'; end if;
    if v_condition not in ('good','damaged','defective') then raise exception 'Condition must be Sellable, Damaged or Defective'; end if;

    select * into v_il from public.invoice_lines where id=v_line_id and invoice_id=p_invoice_id;
    if not found then raise exception 'Return line is not part of the original Pharmacy sale'; end if;
    select pil.product_id,pil.quantity_base into v_product_id,v_sold_base from public.pharmacy_invoice_lines pil
      where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id;
    if not found then raise exception 'Return line is not linked to Pharmacy sale stock'; end if;

    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri
      join public.pharmacy_returns pr on pr.id=ri.return_id
      where pr.store_id=p_store_id and ri.invoice_line_id=v_line_id;
    if v_qty>v_sold_base-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this Pharmacy sale'; end if;

    v_amount:=round(coalesce(v_il.line_total,0)*v_qty/nullif(v_sold_base,0),2);
    if v_penalty>v_amount then raise exception 'Penalty cannot be more than the returned amount of the line'; end if;
    v_returned_total:=v_returned_total+v_amount;
    v_penalty_total:=v_penalty_total+v_penalty;

    select ii.total_stock into v_stock from public.pharmacy_products pp
      join public.inventory_items ii on ii.id=pp.inventory_item_id
      where pp.id=v_product_id and pp.store_id=p_store_id for update of ii;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;

    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,reason_note,penalty,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,null,v_qty,
      case when v_condition='good' then 'sellable' else v_condition end,v_line_reason,v_line_note,v_penalty,v_amount,v_condition='good');

    if v_condition='good' then
      update public.inventory_items set total_stock=total_stock+v_qty,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_product_id);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_restock' else 'customer_return_restock' end,
        v_qty,v_stock,v_stock+v_qty,'pharmacy_return',v_return.id,v_line_reason,p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_restocked:=true;
    else
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_quarantine' else 'customer_return_quarantine' end,
        v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,v_line_reason||' ('||v_condition||', quarantined, excluded from stock)',
        p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_quarantined:=true;
    end if;
  end loop;

  -- 2) Replacement medicines (exchange only): issued from saleable stock at current selling price.
  if p_kind='exchange' then
    for v_raw in select value from jsonb_array_elements(p_new_items) loop
      v_new_product:=nullif(v_raw->>'product_id','')::uuid;
      v_unit_label:=btrim(coalesce(v_raw->>'unit_label',''));
      v_qty:=round(coalesce((v_raw->>'quantity')::numeric,0),3);
      if v_new_product is null or v_unit_label='' or v_qty<=0 then raise exception 'Each replacement needs a medicine, unit and positive quantity'; end if;

      select pu.factor_to_base,coalesce(pu.selling_price,0) into v_factor,v_price from public.pharmacy_product_units pu
        join public.pharmacy_products pp on pp.id=pu.product_id
        where pu.product_id=v_new_product and pu.store_id=p_store_id and pu.unit_label=v_unit_label and pu.can_sell and pp.active;
      if not found then raise exception 'Replacement medicine or unit is not available for sale'; end if;

      v_new_qty_base:=round(v_qty*v_factor,3);
      select ii.total_stock into v_stock from public.pharmacy_products pp
        join public.inventory_items ii on ii.id=pp.inventory_item_id
        where pp.id=v_new_product and pp.store_id=p_store_id for update of ii;
      if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
      if v_stock<v_new_qty_base then raise exception 'Insufficient stock for replacement medicine. Available: %', v_stock; end if;

      v_line_amount:=round(v_price*v_qty,2);
      v_new_total:=v_new_total+v_line_amount;

      insert into public.pharmacy_exchange_items(exchange_id,store_id,product_id,unit_label,unit_factor,quantity_base,unit_price,amount)
      values(v_return.id,p_store_id,v_new_product,v_unit_label,v_factor,v_new_qty_base,v_price,v_line_amount);

      update public.inventory_items set total_stock=total_stock-v_new_qty_base,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_new_product);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_new_product,null,'exchange_issue',v_new_qty_base,v_stock,v_stock-v_new_qty_base,'pharmacy_return',v_return.id,
        'Replacement issued in exchange',p_idempotency_key||':new:'||v_new_product||':'||v_unit_label,p_created_by);
    end loop;
  end if;

  -- 3) Settlement, as in the Electronics console. Refund = returned value minus penalties.
  v_returned_total:=round(v_returned_total,2);
  v_penalty_total:=round(v_penalty_total,2);
  v_new_total:=round(v_new_total,2);
  if p_kind='return' then
    v_refund:=greatest(0,round(v_returned_total-v_penalty_total,2));
    v_diff:=0;
    v_settlement:=case when v_refund>0 then 'shop_refunds' else 'none' end;
    if v_refund>0 and v_refund_method='none' then raise exception 'Refund method is required to refund the returned amount'; end if;
    v_refund_method:=case when v_refund>0 then v_refund_method else 'none' end;
    v_payment_method:='none';
  else
    v_diff:=round(v_new_total-v_returned_total,2);
    v_penalty_total:=0;
    if v_diff>0 then
      v_settlement:='customer_pays';
      if v_payment_method='none' then raise exception 'Payment method is required when the customer pays the difference'; end if;
      v_refund_method:='none';
    elsif v_diff<0 then
      v_settlement:='shop_refunds';
      v_refund:=-v_diff;
      if v_refund_method='none' then raise exception 'Refund method is required when the shop refunds the difference'; end if;
      v_payment_method:='none';
    else
      v_settlement:='even';
      v_refund_method:='none';
      v_payment_method:='none';
    end if;
  end if;
  v_disp:=case when v_restocked and v_quarantined then 'mixed' when v_restocked then 'restocked' else 'quarantined' end;

  update public.pharmacy_returns set amount=v_returned_total,penalty_amount=v_penalty_total,refund_amount=v_refund,
    refund_method=v_refund_method,payment_method=case when v_payment_method='none' then null else v_payment_method end,
    disposition=v_disp,settlement_type=v_settlement,new_items_total=v_new_total,difference_amount=v_diff
    where id=v_return.id
    returning * into v_return;

  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,p_kind,p_invoice_id,v_return.id,p_created_by);

  return to_jsonb(v_return)||jsonb_build_object('refund_amount',v_refund,'restocked',v_restocked,'quarantined',v_quarantined);
end $$;

-- Backfill: earlier returns refunded their full amount.
update public.pharmacy_returns set refund_amount=amount
  where return_type='return' and refund_method is not null and refund_method<>'none' and refund_amount=0;

commit;

-- Round 3: inventory item categories + per-invoice-line VAT/discount.
-- 1) Inventory items get an optional category (NULL = Uncategorized).
-- 2) Invoice lines get their own VAT/tax percent and discount.
-- 3) Invoices store the aggregated line-level VAT/discount so printed and
--    emailed invoices reconcile with the posted totals.

alter table public.inventory_items add column if not exists category text;

alter table public.invoice_lines add column if not exists tax_percent numeric(7,3) not null default 0 check(tax_percent >= 0);
alter table public.invoice_lines add column if not exists discount numeric(14,2) not null default 0 check(discount >= 0);

alter table public.invoices add column if not exists line_tax_amount numeric(14,2) not null default 0;
alter table public.invoices add column if not exists line_discount_amount numeric(14,2) not null default 0;

-- Repost the invoice RPC with line-level VAT/discount support (same signature).
create or replace function public.post_invoice(p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method public.payment_method,p_transaction_id text,p_notes text,p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_subtotal numeric(14,2):=0; v_line_tax numeric(14,2):=0; v_line_disc numeric(14,2):=0; v_tax numeric(14,2); v_total numeric(14,2); v_invoice public.invoices; v_line jsonb; v_item public.inventory_items; v_qty numeric(14,3); v_price numeric(14,2); v_ltax_pct numeric(7,3); v_ltax numeric(14,2); v_ldisc numeric(14,2); v_lsub numeric(14,2);
begin
 if p_kind not in ('purchase','sale') or jsonb_array_length(p_lines)=0 then raise exception 'Invoice type and at least one line are required'; end if;
 for v_line in select * from jsonb_array_elements(p_lines) loop
  v_qty := (v_line->>'quantity')::numeric; v_price := (v_line->>'unitPrice')::numeric;
  v_ltax_pct := coalesce((v_line->>'taxPercent')::numeric,0); v_ldisc := round(coalesce((v_line->>'discount')::numeric,0),2);
  if v_qty <= 0 or v_price < 0 or v_ltax_pct < 0 or v_ldisc < 0 then raise exception 'Invalid item quantity, price, VAT, or discount'; end if;
  select * into v_item from inventory_items where id=(v_line->>'itemId')::uuid and store_id=p_store_id for update;
  if not found then raise exception 'Inventory item does not belong to this store'; end if;
  if p_kind='sale' and v_item.total_stock<v_qty then raise exception 'Insufficient stock for item %',v_item.item_code; end if;
  v_lsub := v_qty*v_price; v_ltax := round(v_lsub*v_ltax_pct/100,2);
  if v_ldisc > v_lsub+v_ltax then raise exception 'Item discount cannot exceed the item total for %',v_item.item_code; end if;
  v_subtotal:=v_subtotal+v_lsub; v_line_tax:=v_line_tax+v_ltax; v_line_disc:=v_line_disc+v_ldisc;
 end loop;
 v_tax:=round(v_subtotal*coalesce(p_tax_percent,0)/100,2);
 v_total:=v_subtotal+v_tax+v_line_tax-coalesce(p_discount,0)-v_line_disc;
 if coalesce(p_paid_amount,0)>v_total then raise exception 'Paid amount cannot exceed invoice total'; end if;
 insert into invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,paid_amount,total_due,line_tax_amount,line_discount_amount,created_by)
 values(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,p_payment_method,p_transaction_id,p_notes,v_subtotal,coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,coalesce(p_paid_amount,0),v_total-coalesce(p_paid_amount,0),v_line_tax,v_line_disc,p_created_by) returning * into v_invoice;
 for v_line in select * from jsonb_array_elements(p_lines) loop
  v_qty:=(v_line->>'quantity')::numeric; v_price:=(v_line->>'unitPrice')::numeric;
  v_ltax_pct:=coalesce((v_line->>'taxPercent')::numeric,0); v_ldisc:=round(coalesce((v_line->>'discount')::numeric,0),2);
  insert into invoice_lines(invoice_id,item_id,quantity,unit_price,tax_percent,discount,line_total)
  values(v_invoice.id,(v_line->>'itemId')::uuid,v_qty,v_price,v_ltax_pct,v_ldisc,round(v_qty*v_price+v_qty*v_price*v_ltax_pct/100,2)-v_ldisc);
  update inventory_items set total_stock=total_stock+(case when p_kind='purchase' then v_qty else -v_qty end),updated_at=now() where id=(v_line->>'itemId')::uuid;
 end loop;
 return v_invoice;
end $$;

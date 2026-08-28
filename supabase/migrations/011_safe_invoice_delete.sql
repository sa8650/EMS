-- Run after 010. Safely reverses inventory movement before deleting an invoice.
create or replace function public.delete_posted_invoice(p_store_id uuid,p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare inv public.invoices; ln record; item public.inventory_items;
begin
 select * into inv from invoices where id=p_invoice_id and store_id=p_store_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 for ln in select * from invoice_lines where invoice_id=inv.id loop
  select * into item from inventory_items where id=ln.item_id for update;
  if inv.kind='purchase' and item.total_stock<ln.quantity then raise exception 'Cannot delete purchase invoice: stock for item % has already been sold or adjusted',item.item_code; end if;
  update inventory_items set total_stock=total_stock+(case when inv.kind='purchase' then -ln.quantity else ln.quantity end),updated_at=now() where id=ln.item_id;
 end loop;
 delete from invoices where id=inv.id;
end $$;
revoke all on function public.delete_posted_invoice(uuid,uuid) from public;

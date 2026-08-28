-- Run after 008. Stable human-readable IDs for business records and invoices.
create sequence if not exists public.supplier_code_seq start 1;
create sequence if not exists public.customer_code_seq start 1;
create sequence if not exists public.expense_code_seq start 1;
create sequence if not exists public.inventory_code_seq start 1;
create sequence if not exists public.sale_invoice_code_seq start 1;
create sequence if not exists public.purchase_invoice_code_seq start 1;

alter table public.suppliers add column if not exists supplier_code text;
alter table public.customers add column if not exists customer_code text;
alter table public.expenses add column if not exists expense_code text;
-- Existing item codes are standardized to the requested format during this migration.
with n as (select id,row_number() over(order by created_at) rn from public.suppliers where supplier_code is null) update public.suppliers x set supplier_code='SUP-'||lpad(n.rn::text,5,'0') from n where x.id=n.id;
with n as (select id,row_number() over(order by created_at) rn from public.customers where customer_code is null) update public.customers x set customer_code='CUS-'||lpad(n.rn::text,6,'0') from n where x.id=n.id;
with n as (select id,row_number() over(order by created_at) rn from public.expenses where expense_code is null) update public.expenses x set expense_code='EXP-'||lpad(n.rn::text,5,'0') from n where x.id=n.id;
with n as (select id,row_number() over(order by created_at) rn from public.inventory_items) update public.inventory_items x set item_code='ITM-'||lpad(n.rn::text,7,'0') from n where x.id=n.id;
alter table public.suppliers alter column supplier_code set not null;
alter table public.customers alter column customer_code set not null;
alter table public.expenses alter column expense_code set not null;
create unique index if not exists suppliers_supplier_code_uq on public.suppliers(supplier_code);
create unique index if not exists customers_customer_code_uq on public.customers(customer_code);
create unique index if not exists expenses_expense_code_uq on public.expenses(expense_code);
select setval('public.supplier_code_seq',greatest(1,count(*)),count(*)>0) from public.suppliers;
select setval('public.customer_code_seq',greatest(1,count(*)),count(*)>0) from public.customers;
select setval('public.expense_code_seq',greatest(1,count(*)),count(*)>0) from public.expenses;
select setval('public.inventory_code_seq',greatest(1,count(*)),count(*)>0) from public.inventory_items;
alter table public.suppliers alter column supplier_code set default ('SUP-'||lpad(nextval('public.supplier_code_seq')::text,5,'0'));
alter table public.customers alter column customer_code set default ('CUS-'||lpad(nextval('public.customer_code_seq')::text,6,'0'));
alter table public.expenses alter column expense_code set default ('EXP-'||lpad(nextval('public.expense_code_seq')::text,5,'0'));
alter table public.inventory_items alter column item_code set default ('ITM-'||lpad(nextval('public.inventory_code_seq')::text,7,'0'));
select setval('public.sale_invoice_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::bigint) from public.invoices where kind='sale'),0)),exists(select 1 from public.invoices where kind='sale'));
select setval('public.purchase_invoice_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::bigint) from public.invoices where kind='purchase'),0)),exists(select 1 from public.invoices where kind='purchase'));
create or replace function public.next_ems_invoice_number(p_kind text) returns text language plpgsql security definer set search_path=public as $$ begin if p_kind='sale' then return 'SAL-'||lpad(nextval('public.sale_invoice_code_seq')::text,6,'0'); elsif p_kind='purchase' then return 'PUR-'||lpad(nextval('public.purchase_invoice_code_seq')::text,6,'0'); else raise exception 'Unknown invoice type'; end if; end $$;
create or replace function public.peek_ems_invoice_number(p_kind text) returns text language plpgsql security definer set search_path=public as $$ declare n bigint; begin select coalesce(max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::bigint),0)+1 into n from public.invoices where kind=p_kind; if p_kind='sale' then return 'SAL-'||lpad(n::text,6,'0'); elsif p_kind='purchase' then return 'PUR-'||lpad(n::text,6,'0'); else raise exception 'Unknown invoice type'; end if; end $$;
revoke all on function public.next_ems_invoice_number(text),public.peek_ems_invoice_number(text) from public;

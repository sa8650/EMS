-- Run after 013. Preserve walk-in/custom customer details on sales invoices.
alter table public.invoices add column if not exists custom_party_name text;
alter table public.invoices add column if not exists custom_party_address text;
alter table public.invoices add column if not exists custom_party_phone text;

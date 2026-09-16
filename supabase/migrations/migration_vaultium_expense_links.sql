-- Vaultium: link uploaded files to expense records (in addition to invoices).
-- Idempotent — safe to run more than once (Postgres / Supabase).
alter table public.vaultium_files
  add column if not exists expense_id uuid references public.expenses(id) on delete set null;
alter table public.vaultium_files
  add column if not exists expense_code text;

create index if not exists idx_vaultium_invoice on public.vaultium_files(invoice_id);
create index if not exists idx_vaultium_expense on public.vaultium_files(expense_id);

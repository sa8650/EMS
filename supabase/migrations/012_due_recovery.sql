-- Run after 011. Records recoveries against sale/purchase invoices and expenses.
create table public.due_recoveries (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
 source_type text not null check(source_type in ('sale','purchase','expense')),
 source_id uuid not null, amount numeric(14,2) not null check(amount>0), note text,
 recovered_by uuid, created_at timestamptz not null default now()
);
create index due_recoveries_store_source_idx on public.due_recoveries(store_id,source_type,source_id,created_at desc);
revoke all on public.due_recoveries from anon,authenticated;
alter table public.due_recoveries enable row level security;

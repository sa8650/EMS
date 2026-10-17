-- Migration 036: Sales Return & Refund
-- Adds returns, return_items, and inventory_stock_movements tables.

create table if not exists public.returns (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  return_number       text not null,
  customer_id         uuid references public.customers(id) on delete set null,
  customer_name       text,
  return_date         date not null default current_date,
  subtotal            numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  discount_amount     numeric(14,2) not null default 0,
  penalty_amount      numeric(14,2) not null default 0,
  total_return_amount numeric(14,2) not null default 0,
  refunded_amount     numeric(14,2) not null default 0,
  refund_method       text default 'cash',
  transaction_id      text,
  status              text not null default 'refunded' check(status in ('pending_refund','partially_refunded','refunded')),
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(store_id, return_number)
);

create index if not exists returns_store_id_idx on public.returns(store_id);
create index if not exists returns_invoice_id_idx on public.returns(invoice_id);

create table if not exists public.return_items (
  id                  uuid primary key default gen_random_uuid(),
  return_id           uuid not null references public.returns(id) on delete cascade,
  invoice_line_id     uuid references public.invoice_lines(id) on delete set null,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  quantity            numeric(14,3) not null check(quantity > 0),
  unit_price          numeric(14,2) not null check(unit_price >= 0),
  tax_percent         numeric(7,3)  not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  discount            numeric(14,2) not null default 0,
  penalty             numeric(14,2) not null default 0,
  return_amount       numeric(14,2) not null check(return_amount >= 0),
  reason              text not null check(reason in ('Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other')),
  reason_note         text,
  condition           text not null check(condition in ('Sellable','Damaged','Defective','Warranty')),
  imei_serial         text,
  created_at          timestamptz not null default now()
);

create index if not exists return_items_return_id_idx on public.return_items(return_id);
create index if not exists return_items_item_id_idx on public.return_items(item_id);

-- Drop obsolete standalone refunds table if present (refund is integrated directly on return)
drop table if exists public.refunds cascade;

create table if not exists public.inventory_stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  return_id           uuid references public.returns(id) on delete cascade,
  movement_type       text not null check(movement_type in ('return_restock','return_damaged','return_defective','return_warranty')),
  quantity            numeric(14,3) not null,
  stock_before        numeric(14,3),
  stock_after         numeric(14,3),
  condition           text not null,
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now()
);

create index if not exists inv_movements_store_id_idx on public.inventory_stock_movements(store_id);
create index if not exists inv_movements_item_id_idx on public.inventory_stock_movements(item_id);
create index if not exists inv_movements_return_id_idx on public.inventory_stock_movements(return_id);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.inventory_stock_movements enable row level security;

grant all on public.returns to service_role;
grant all on public.return_items to service_role;
grant all on public.inventory_stock_movements to service_role;

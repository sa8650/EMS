-- Migration 037: Sales Exchange
-- Adds exchanges and exchange_items tables, and links inventory_stock_movements to exchanges.

create table if not exists public.exchanges (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  exchange_number     text not null,
  customer_id         uuid references public.customers(id) on delete set null,
  customer_name       text,
  exchange_date       date not null default current_date,
  returned_total      numeric(14,2) not null default 0,
  new_items_subtotal  numeric(14,2) not null default 0,
  new_items_tax       numeric(14,2) not null default 0,
  new_items_discount  numeric(14,2) not null default 0,
  new_items_total     numeric(14,2) not null default 0,
  difference_amount   numeric(14,2) not null default 0,
  action_type         text not null default 'even' check(action_type in ('payment','refund','even')),
  payment_method      text check(payment_method in ('cash','bank','bkash','nagad','other','none')) default 'none',
  transaction_id      text,
  status              text not null default 'completed' check(status in ('completed','cancelled')),
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(store_id, exchange_number)
);

create index if not exists exchanges_store_id_idx on public.exchanges(store_id);
create index if not exists exchanges_invoice_id_idx on public.exchanges(invoice_id);

create table if not exists public.exchange_items (
  id                  uuid primary key default gen_random_uuid(),
  exchange_id         uuid not null references public.exchanges(id) on delete cascade,
  item_type           text not null check(item_type in ('returned','new')),
  invoice_line_id     uuid references public.invoice_lines(id) on delete set null,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  quantity            numeric(14,3) not null check(quantity > 0),
  unit_price          numeric(14,2) not null check(unit_price >= 0),
  tax_percent         numeric(7,3)  not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  discount            numeric(14,2) not null default 0,
  total_amount        numeric(14,2) not null check(total_amount >= 0),
  reason              text,
  reason_note         text,
  condition           text,
  created_at          timestamptz not null default now()
);

create index if not exists exchange_items_exchange_id_idx on public.exchange_items(exchange_id);
create index if not exists exchange_items_item_id_idx on public.exchange_items(item_id);

alter table public.inventory_stock_movements add column if not exists exchange_id uuid references public.exchanges(id) on delete cascade;
create index if not exists inv_movements_exchange_id_idx on public.inventory_stock_movements(exchange_id);

alter table public.inventory_stock_movements drop constraint if exists inventory_stock_movements_movement_type_check;

alter table public.exchanges enable row level security;
alter table public.exchange_items enable row level security;

grant all on public.exchanges to service_role;
grant all on public.exchange_items to service_role;

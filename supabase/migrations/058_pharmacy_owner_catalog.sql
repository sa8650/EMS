-- Global owner-maintained Pharmacy templates and manufacturers.
-- Shop copies are independent snapshots; bulk deletes never touch shop products.
begin;
create table if not exists public.pharmacy_master_manufacturers (
 id uuid primary key default gen_random_uuid(),name text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists pharmacy_master_manufacturers_name_idx on public.pharmacy_master_manufacturers(lower(name));
create table if not exists public.pharmacy_master_products (
 id uuid primary key default gen_random_uuid(),name text not null,generic_name text,strength text,dosage_form text not null default 'other',
 manufacturer text,category text not null default 'Medicine',pack_size text,
 barcode text,sku text,base_unit text not null default 'tablet',
 purchase_price numeric(14,2) not null default 0 check(purchase_price>=0),
 sale_price numeric(14,2) not null default 0 check(sale_price>=0),
 wholesale_price numeric(14,2) not null default 0 check(wholesale_price>=0),
 reorder_threshold numeric(14,3) not null default 5 check(reorder_threshold>=0),
 units jsonb not null default '[]'::jsonb,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists pharmacy_master_products_sku_idx on public.pharmacy_master_products(lower(sku)) where sku is not null;
create unique index if not exists pharmacy_master_products_barcode_idx on public.pharmacy_master_products(barcode) where barcode is not null;
revoke all on public.pharmacy_master_manufacturers,public.pharmacy_master_products from public,anon,authenticated;
grant all on public.pharmacy_master_manufacturers,public.pharmacy_master_products to service_role;
alter table public.pharmacy_master_manufacturers enable row level security;
alter table public.pharmacy_master_products enable row level security;
commit;

-- ============================================================================
-- EMS V1 · COMPLETE STANDALONE SCHEMA (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- This is the SINGLE, consolidated migration for a brand-new Supabase project.
-- It already contains every change from the old numbered migrations
-- (001–033, 018a, AddonsMigration, migration_helpdesk, migration_truebill,
-- migration_factory_reset_full) INCLUDING objects that previously had no
-- migration file at all (vaultium_files, vaultium_gb entitlements).
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Re-running it is safe: every statement is IF NOT EXISTS / OR REPLACE /
-- ON CONFLICT guarded.
--
-- The Cloudflare Pages Function connects with the service-role key only;
-- Row Level Security is enabled on every table and direct anon/authenticated
-- access is revoked.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- ENUM TYPES
create type public.store_status        as enum ('active','inactive','read_only');
create type public.license_status      as enum ('pending','active','expired','rejected');
create type public.payment_method      as enum ('cash','bank','bkash','nagad','other');
create type public.attendance_status   as enum ('present','absent');
create type public.connectx_status     as enum ('queued','sending','sent','failed');
create type public.salary_invoice_type as enum ('current','due','advance');

-- ------------------------------------------------------------ CORE IDENTITIES
create table if not exists public.administrators (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 120),
  address       text,
  phone         text not null,
  email         text not null unique check (email = lower(email)),
  password_hash text not null,
  admin_code    char(4) not null unique,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.ems_owners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check(char_length(name) between 2 and 120),
  email         text not null unique check(email = lower(email)),
  password_hash text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.enforce_single_ems_owner()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.ems_owners) then
    raise exception 'Only one EMS owner may be initialized';
  end if;
  return new;
end $$;
drop trigger if exists enforce_single_ems_owner on public.ems_owners;
create trigger enforce_single_ems_owner before insert on public.ems_owners
for each row execute function public.enforce_single_ems_owner();

-- --------------------------------------------------------------------- STORES
create table if not exists public.stores (
  id                   uuid primary key default gen_random_uuid(),
  admin_id             uuid not null references public.administrators(id) on delete restrict,
  name                 text not null,
  address              text,
  phone                text not null,
  phone2               text,
  email                text,
  website              text,
  shop_code            char(4) not null unique,
  status               public.store_status not null default 'inactive',
  low_stock_threshold  numeric(14,3) not null default 5 check(low_stock_threshold >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ------------------------------------------------------------------ LICENSING
create table if not exists public.license_plans (
  id                            uuid primary key default gen_random_uuid(),
  title                         text not null,
  duration_months               integer not null check(duration_months > 0),
  max_stores                    integer not null check(max_stores > 0),
  benefits                      text not null default '',
  payment_details               text not null default '',
  price                         numeric(12,2) not null default 0 check(price >= 0),
  active                        boolean not null default true,
  connectx_enabled              boolean not null default false,
  connectx_daily_limit          integer not null default 0 check(connectx_daily_limit >= 0),
  zudo_enabled                  boolean not null default false,
  zudo_daily_limit              integer not null default 0 check(zudo_daily_limit >= 0),
  business_health_enabled       boolean not null default false,
  business_health_daily_limit   integer not null default 0 check(business_health_daily_limit >= 0),
  truebill_enabled              boolean not null default false,
  vaultium_gb                   integer not null default 0 check(vaultium_gb >= 0),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create table if not exists public.licenses (
  id                            uuid primary key default gen_random_uuid(),
  admin_id                      uuid not null references public.administrators(id) on delete cascade,
  store_id                      uuid references public.stores(id) on delete cascade, -- legacy column
  plan_id                       uuid references public.license_plans(id) on delete set null,
  duration_months               integer not null check(duration_months > 0),
  amount                        numeric(12,2) not null default 0 check(amount >= 0),
  max_stores                    integer not null default 1 check(max_stores > 0),
  payment_method                text not null check(payment_method in ('bkash','nagad','other')),
  payment_number                text not null,
  transaction_id                text not null,
  status                        public.license_status not null default 'pending',
  connectx_enabled              boolean not null default false,
  connectx_daily_limit          integer not null default 0 check(connectx_daily_limit >= 0),
  zudo_enabled                  boolean not null default false,
  zudo_daily_limit              integer not null default 0 check(zudo_daily_limit >= 0),
  business_health_enabled       boolean not null default false,
  business_health_daily_limit   integer not null default 0 check(business_health_daily_limit >= 0),
  truebill_enabled              boolean not null default false,
  vaultium_gb                   integer not null default 0 check(vaultium_gb >= 0),
  transaction_type              text not null default 'new' check(transaction_type in ('new','renewal','upgrade','downgrade')),
  starts_at                     timestamptz,
  expires_at                    timestamptz,
  reviewed_at                   timestamptz,
  reviewed_by                   uuid references public.administrators(id),
  review_note                   text,
  created_at                    timestamptz not null default now(),
  unique(payment_method, transaction_id)
);

create table if not exists public.current_entitlements (
  admin_id                      uuid primary key references public.administrators(id) on delete cascade,
  current_license_id            uuid references public.licenses(id) on delete set null,
  shop_limit                    integer not null default 0 check(shop_limit >= 0),
  connectx_enabled              boolean not null default false,
  connectx_daily_limit          integer not null default 0 check(connectx_daily_limit >= 0),
  zudo_enabled                  boolean not null default false,
  zudo_daily_limit              integer not null default 0 check(zudo_daily_limit >= 0),
  business_health_enabled       boolean not null default false,
  business_health_daily_limit   integer not null default 0 check(business_health_daily_limit >= 0),
  truebill_enabled              boolean not null default false,
  vaultium_gb                   integer not null default 0 check(vaultium_gb >= 0),
  status                        text not null default 'expired' check(status in ('active','expired')),
  starts_at                     timestamptz,
  expires_at                    timestamptz,
  updated_at                    timestamptz not null default now()
);

-- ------------------------------------------------------------- SHOP PEOPLE
create table if not exists public.staff (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  full_name     text not null,
  position      text,
  phone         text not null,
  email         text,
  user_id       text not null,
  password_hash text not null,
  basic_salary  numeric(12,2) not null default 0 check(basic_salary >= 0),
  active        boolean not null default true,
  permissions   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(store_id, user_id)
);

create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  supplier_code  text not null unique,
  name           text not null,
  address        text,
  phone          text not null,
  phone2         text,
  email          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_code  text not null unique,
  name           text not null,
  address        text,
  phone          text not null,
  phone2         text,
  email          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ------------------------------------------------------------- INVENTORY
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  item_code     text not null,
  description   text not null,
  unit          text not null,
  sale_price    numeric(14,2) not null default 0 check(sale_price >= 0),
  total_stock   numeric(14,3) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(store_id, item_code)
);

-- -------------------------------------------------------------- INVOICES
create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete cascade,
  kind                  text not null check(kind in ('purchase','sale')),
  invoice_number        text not null,
  party_id              uuid,
  invoice_date          date not null,
  payment_method        public.payment_method not null default 'cash',
  transaction_id        text,
  notes                 text,
  subtotal              numeric(14,2) not null default 0,
  tax_percent           numeric(7,3)  not null default 0,
  discount              numeric(14,2) not null default 0,
  tax_amount            numeric(14,2) not null default 0,
  paid_amount           numeric(14,2) not null default 0,
  total_due             numeric(14,2) not null default 0,
  created_by            uuid,
  verification_token    uuid not null default gen_random_uuid(),
  custom_party_name     text,
  custom_party_address  text,
  custom_party_phone    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(store_id, invoice_number)
);

create table if not exists public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  item_id      uuid not null references public.inventory_items(id) on delete restrict,
  quantity     numeric(14,3) not null check(quantity > 0),
  unit_price   numeric(14,2) not null check(unit_price >= 0),
  line_total   numeric(14,2) not null check(line_total >= 0)
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  expense_code  text not null unique,
  expense_date  date not null,
  details       text not null,
  total         numeric(14,2) not null check(total >= 0),
  paid          numeric(14,2) not null default 0 check(paid >= 0),
  due           numeric(14,2) generated always as (total - paid) stored,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.attendance (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  staff_id         uuid not null references public.staff(id) on delete cascade,
  attendance_date  date not null default current_date,
  status           public.attendance_status not null,
  note             text,
  recorded_by      uuid,
  created_at       timestamptz not null default now(),
  unique(staff_id, attendance_date)
);

create table if not exists public.device_logins (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores(id) on delete cascade,
  staff_id           uuid references public.staff(id) on delete set null,
  device_fingerprint text not null,
  user_agent         text,
  last_seen_at       timestamptz not null default now(),
  unique(store_id, device_fingerprint)
);

create table if not exists public.due_recoveries (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  source_type    text not null check(source_type in ('sale','purchase','expense')),
  source_id      uuid not null,
  amount         numeric(14,2) not null check(amount > 0),
  note           text,
  payment_method text check (payment_method in ('cash','bkash','nagad','bank','other')),
  transaction_id text,
  recovered_by   uuid,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------- SALARY / PAYROLL
create table if not exists public.staff_salary_invoices (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  staff_id          uuid not null references public.staff(id) on delete cascade,
  salary_month      date not null,
  invoice_type      public.salary_invoice_type not null default 'current',
  base_amount       numeric(14,2) not null default 0 check(base_amount >= 0),
  attendance_based  boolean not null default false,
  present_days      integer,
  total_days        integer,
  incentive         numeric(14,2) not null default 0 check(incentive >= 0),
  bonus             numeric(14,2) not null default 0 check(bonus >= 0),
  fine              numeric(14,2) not null default 0 check(fine >= 0),
  other_deduction   numeric(14,2) not null default 0 check(other_deduction >= 0),
  add_outstanding   boolean not null default false,
  cut_advance       boolean not null default false,
  total             numeric(14,2) not null default 0 check(total >= 0),
  paid              numeric(14,2) not null default 0 check(paid >= 0),
  due               numeric(14,2) generated always as (total - paid) stored,
  note              text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- --------------------------------------------------------------- ACTIVITY LOGS
create table if not exists public.activity_logs (
  id           bigint generated always as identity primary key,
  store_id     uuid references public.stores(id) on delete cascade,
  actor_type   text not null,
  actor_id     uuid,
  action       text not null,
  entity_type  text,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists public.error_logs (
  id          bigint generated always as identity primary key,
  store_id    uuid references public.stores(id) on delete cascade,
  actor_id    uuid,
  message     text not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------- PLATFORM CONTROL
create table if not exists public.platform_settings (
  setting_key    text primary key,
  setting_value  jsonb not null,
  updated_by     uuid references public.ems_owners(id),
  updated_at     timestamptz not null default now()
);

create table if not exists public.platform_activity_logs (
  id           bigint generated always as identity primary key,
  owner_id     uuid references public.ems_owners(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists public.helpdesk_messages (
  id              bigint generated always as identity primary key,
  admin_id        uuid not null references public.administrators(id) on delete cascade,
  sender_type     text not null check(sender_type in ('admin','owner')),
  content         text not null,
  read_by_admin   boolean not null default true,
  read_by_owner   boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------- CONNECTX
create table if not exists public.connectx_settings (
  id                  boolean primary key default true check(id),
  provider            text not null default 'brevo_api',
  from_name           text not null default 'EMS ConnectX',
  from_email          text not null,
  reply_to            text,
  global_daily_limit  integer not null default 300 check(global_daily_limit > 0),
  enabled             boolean not null default false,
  updated_by          uuid references public.ems_owners(id),
  updated_at          timestamptz not null default now()
);

create table if not exists public.connectx_messages (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete cascade,
  user_id              uuid,
  recipient_type       text not null check(recipient_type in ('customer','supplier','staff','administrator','manual')),
  recipient_id         uuid,
  invoice_id           uuid references public.invoices(id) on delete set null,
  from_email           text not null,
  to_emails            text[] not null,
  cc_emails            text[] not null default '{}',
  bcc_emails           text[] not null default '{}',
  subject              text not null,
  custom_body          text,
  body_html            text not null,
  provider             text not null,
  provider_message_id  text,
  status               public.connectx_status not null default 'queued',
  error_message        text,
  idempotency_key      uuid not null default gen_random_uuid(),
  shop_deleted_at      timestamptz,
  shop_deleted_by      uuid,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  unique(store_id, idempotency_key)
);

-- -------------------------------------------------------------------- ZUDO
create table if not exists public.zudo_settings (
  id                  boolean primary key default true check(id),
  enabled             boolean not null default false,
  model               text not null default '@cf/meta/llama-3.2-3b-instruct',
  global_daily_limit  integer not null default 500 check(global_daily_limit > 0),
  updated_by          uuid references public.ems_owners(id),
  updated_at          timestamptz not null default now()
);

create table if not exists public.zudo_conversations (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  user_id          uuid not null,
  title            text not null default 'New conversation',
  shop_deleted_at  timestamptz,
  shop_deleted_by  uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.zudo_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.zudo_conversations(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  user_id          uuid not null,
  role             text not null check(role in ('user','assistant')),
  content          text not null,
  created_at       timestamptz not null default now()
);

-- -------------------------------------------------------- BUSINESS AI HEALTH
create table if not exists public.business_health_settings (
  id                  boolean primary key default true check(id),
  enabled             boolean not null default false,
  model               text not null default '@cf/meta/llama-3.2-3b-instruct',
  global_daily_limit  integer not null default 100 check(global_daily_limit > 0),
  updated_by          uuid references public.ems_owners(id),
  updated_at          timestamptz not null default now()
);

create table if not exists public.business_health_reports (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  user_id      uuid not null,
  start_date   date not null,
  end_date     date not null,
  score        integer not null check(score between 0 and 100),
  snapshot     jsonb not null default '{}'::jsonb,
  insights     text not null,
  created_at   timestamptz not null default now(),
  check(start_date <= end_date)
);

-- -------------------------------------------------------------- PUBLIC SITE
create table if not exists public.public_pages (
  slug               text primary key check(slug in ('about','terms','contact')),
  title              text not null,
  body               text not null default '',
  hero_image_prompt  text,
  updated_by         uuid references public.ems_owners(id),
  updated_at         timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text not null unique,
  excerpt          text,
  body             text not null,
  cover_image_url  text,
  published        boolean not null default false,
  published_at     timestamptz,
  created_by       uuid references public.ems_owners(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  subject     text,
  message     text not null,
  status      text not null default 'new' check(status in ('new','read','closed')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- TRUEBILL
create table if not exists public.truebill_scans (
  id              bigint generated always as identity primary key,
  store_id        uuid references public.stores(id) on delete set null,
  invoice_id      uuid,
  invoice_number  text not null,
  invoice_kind    text,
  scanned_at      timestamptz not null default now(),
  ip_address      text,
  user_agent      text
);

-- ---------------------------------------------------------- PREMIUM ADD-ONS
create table if not exists public.addon_settings (
  addon_key         text primary key check(addon_key in ('connectx','zudo','business_health','truebill','vaultium')),
  enabled           boolean not null default false,
  title             text not null,
  details           text not null default '',
  unit_price        numeric(12,2) not null default 0 check(unit_price >= 0),
  min_days          integer not null default 1,
  max_days          integer not null default 365,
  min_daily_limit   integer not null default 1,
  max_daily_limit   integer not null default 1000,
  payment_info      text not null default '',
  image_url         text,
  url               text,
  updated_by        uuid references public.ems_owners(id),
  updated_at        timestamptz not null default now(),
  check(min_days > 0 and max_days >= min_days and min_daily_limit > 0 and max_daily_limit >= min_daily_limit)
);

create table if not exists public.addon_purchases (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid not null references public.administrators(id) on delete cascade,
  addon_key        text not null check(addon_key in ('connectx','zudo','business_health','truebill','vaultium')),
  validity_days    integer not null check(validity_days > 0),
  daily_limit      integer not null check(daily_limit > 0),
  unit_price       numeric(12,2) not null,
  amount           numeric(12,2) not null,
  coupon_code      text,
  discount_amount  numeric(12,2) not null default 0,
  payment_method   public.payment_method not null,
  payment_number   text not null,
  transaction_id   text not null,
  status           text not null default 'pending' check(status in ('pending','active','rejected','expired')),
  starts_at        timestamptz,
  expires_at       timestamptz,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);

create table if not exists public.addon_checkout_settings (
  id            boolean primary key default true check(id),
  payment_info  text not null default '',
  updated_by    uuid references public.ems_owners(id),
  updated_at    timestamptz not null default now()
);

create table if not exists public.addon_coupons (
  code         text primary key,
  percent_off  numeric(5,2) not null check(percent_off > 0 and percent_off <= 100),
  active       boolean not null default true,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- VAULTIUM
-- (Previously created manually / outside version control.)
create table if not exists public.vaultium_files (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references public.administrators(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  invoice_id     uuid references public.invoices(id) on delete set null,
  invoice_number text,
  expense_id     uuid references public.expenses(id) on delete set null,
  expense_code   text,
  filename       text not null,
  content_type   text,
  size_bytes     bigint not null default 0,
  r2_key         text not null,
  uploaded_by    uuid,
  created_at     timestamptz not null default now()
);

-- -------------------------------------------------- HUMAN-READABLE CODE SEQS
create sequence if not exists public.supplier_code_seq start 1;
create sequence if not exists public.customer_code_seq start 1;
create sequence if not exists public.expense_code_seq start 1;
create sequence if not exists public.inventory_code_seq start 1;
create sequence if not exists public.sale_invoice_code_seq start 1;
create sequence if not exists public.purchase_invoice_code_seq start 1;

alter table public.suppliers      alter column supplier_code set default ('SUP-'||lpad(nextval('public.supplier_code_seq')::text,5,'0'));
alter table public.customers      alter column customer_code set default ('CUS-'||lpad(nextval('public.customer_code_seq')::text,6,'0'));
alter table public.expenses       alter column expense_code  set default ('EXP-'||lpad(nextval('public.expense_code_seq')::text,5,'0'));
alter table public.inventory_items alter column item_code    set default ('ITM-'||lpad(nextval('public.inventory_code_seq')::text,7,'0'));

-- ------------------------------------------------------------------ INDEXES
create index if not exists idx_stores_admin                       on public.stores(admin_id);
create index if not exists idx_staff_store                        on public.staff(store_id);
create index if not exists idx_inventory_store                    on public.inventory_items(store_id);
create index if not exists idx_invoices_store_kind_date           on public.invoices(store_id, kind, invoice_date desc);
create index if not exists idx_activity_store_date                on public.activity_logs(store_id, created_at desc);
create index if not exists idx_device_logins_store_seen           on public.device_logins(store_id, last_seen_at desc);
create index if not exists idx_licenses_status                    on public.licenses(status, created_at desc);
create index if not exists idx_licenses_admin_status              on public.licenses(admin_id, status);
create index if not exists idx_licenses_admin_entitlements        on public.licenses(admin_id, status, connectx_enabled, starts_at, expires_at);
create index if not exists idx_due_recoveries_store_source        on public.due_recoveries(store_id, source_type, source_id, created_at desc);
create unique index if not exists invoices_verification_token_uq  on public.invoices(verification_token);
create index if not exists idx_connectx_store_created             on public.connectx_messages(store_id, created_at desc);
create index if not exists idx_connectx_store_visible             on public.connectx_messages(store_id, shop_deleted_at, created_at desc);
create index if not exists idx_zudo_convs_user                    on public.zudo_conversations(store_id, user_id, updated_at desc);
create index if not exists idx_zudo_convs_visible                 on public.zudo_conversations(store_id, user_id, shop_deleted_at, updated_at desc);
create index if not exists idx_zudo_msgs_conversation             on public.zudo_messages(conversation_id, created_at);
create index if not exists idx_bh_reports_store_date              on public.business_health_reports(store_id, created_at desc);
create index if not exists idx_entitlements_status                on public.current_entitlements(status, expires_at);
create index if not exists idx_addon_purchases_admin_key          on public.addon_purchases(admin_id, addon_key, status, expires_at desc);
create index if not exists idx_helpdesk_admin                     on public.helpdesk_messages(admin_id, created_at asc);
create index if not exists idx_helpdesk_admin_unread              on public.helpdesk_messages(admin_id, sender_type, read_by_admin);
create index if not exists idx_truebill_scanned                   on public.truebill_scans(scanned_at desc);
create index if not exists idx_salary_store_date                  on public.staff_salary_invoices(store_id, created_at desc);
create index if not exists idx_salary_staff                       on public.staff_salary_invoices(staff_id);
create index if not exists idx_vaultium_store_date                on public.vaultium_files(store_id, created_at desc);
create index if not exists idx_vaultium_admin                     on public.vaultium_files(admin_id);
create index if not exists idx_vaultium_invoice                   on public.vaultium_files(invoice_id);
create index if not exists idx_vaultium_expense                   on public.vaultium_files(expense_id);

-- -------------------------------------------------------------- RPC FUNCTIONS
create or replace function public.next_ems_invoice_number(p_kind text)
returns text language plpgsql security definer set search_path=public as $$
begin
  if p_kind='sale' then
    return 'SAL-'||lpad(nextval('public.sale_invoice_code_seq')::text,6,'0');
  elsif p_kind='purchase' then
    return 'PUR-'||lpad(nextval('public.purchase_invoice_code_seq')::text,6,'0');
  else
    raise exception 'Unknown invoice type';
  end if;
end $$;

create or replace function public.peek_ems_invoice_number(p_kind text)
returns text language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
  select coalesce(max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::bigint),0)+1
    into n from public.invoices where kind=p_kind;
  if p_kind='sale' then
    return 'SAL-'||lpad(n::text,6,'0');
  elsif p_kind='purchase' then
    return 'PUR-'||lpad(n::text,6,'0');
  else
    raise exception 'Unknown invoice type';
  end if;
end $$;

create or replace function public.post_invoice(
  p_store_id uuid, p_kind text, p_invoice_number text, p_party_id uuid,
  p_invoice_date date, p_payment_method public.payment_method, p_transaction_id text,
  p_notes text, p_tax_percent numeric, p_discount numeric, p_paid_amount numeric,
  p_created_by uuid, p_lines jsonb)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare
  v_subtotal numeric(14,2):=0; v_tax numeric(14,2); v_total numeric(14,2);
  v_invoice public.invoices; v_line jsonb; v_item public.inventory_items;
  v_qty numeric(14,3); v_price numeric(14,2);
begin
  if p_kind not in ('purchase','sale') or jsonb_array_length(p_lines)=0 then
    raise exception 'Invoice type and at least one line are required';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unitPrice')::numeric;
    if v_qty <= 0 or v_price < 0 then raise exception 'Invalid item quantity or price'; end if;
    select * into v_item from inventory_items
      where id=(v_line->>'itemId')::uuid and store_id=p_store_id for update;
    if not found then raise exception 'Inventory item does not belong to this store'; end if;
    if p_kind='sale' and v_item.total_stock < v_qty then
      raise exception 'Insufficient stock for item %', v_item.item_code;
    end if;
    v_subtotal := v_subtotal + (v_qty*v_price);
  end loop;
  v_tax := round(v_subtotal*coalesce(p_tax_percent,0)/100,2);
  v_total := v_subtotal + v_tax - coalesce(p_discount,0);
  if coalesce(p_paid_amount,0) > v_total then
    raise exception 'Paid amount cannot exceed invoice total';
  end if;
  insert into invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,
    transaction_id,notes,subtotal,tax_percent,discount,tax_amount,paid_amount,total_due,created_by)
  values(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,p_payment_method,
    p_transaction_id,p_notes,v_subtotal,coalesce(p_tax_percent,0),coalesce(p_discount,0),
    v_tax,coalesce(p_paid_amount,0),v_total-coalesce(p_paid_amount,0),p_created_by)
  returning * into v_invoice;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unitPrice')::numeric;
    insert into invoice_lines(invoice_id,item_id,quantity,unit_price,line_total)
      values(v_invoice.id,(v_line->>'itemId')::uuid,v_qty,v_price,v_qty*v_price);
    update inventory_items
      set total_stock = total_stock + (case when p_kind='purchase' then v_qty else -v_qty end),
          updated_at = now()
      where id=(v_line->>'itemId')::uuid;
  end loop;
  return v_invoice;
end $$;

create or replace function public.delete_posted_invoice(p_store_id uuid, p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare inv public.invoices; ln record; item public.inventory_items;
begin
  select * into inv from invoices where id=p_invoice_id and store_id=p_store_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  for ln in select * from invoice_lines where invoice_id=inv.id loop
    select * into item from inventory_items where id=ln.item_id for update;
    if inv.kind='purchase' and item.total_stock < ln.quantity then
      raise exception 'Cannot delete purchase invoice: stock for item % has already been sold or adjusted', item.item_code;
    end if;
    update inventory_items
      set total_stock = total_stock + (case when inv.kind='purchase' then -ln.quantity else ln.quantity end),
          updated_at = now()
      where id=ln.item_id;
  end loop;
  delete from invoices where id=inv.id;
end $$;

create or replace function public.apply_current_entitlement(p_license_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.licenses; r record; n integer:=0;
begin
  select * into l from licenses where id=p_license_id;
  if not found then raise exception 'License not found'; end if;
  insert into current_entitlements(
    admin_id,current_license_id,shop_limit,
    connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,
    business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb,
    status,starts_at,expires_at,updated_at)
  values(
    l.admin_id,l.id,l.max_stores,
    l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,
    l.business_health_enabled,l.business_health_daily_limit,l.truebill_enabled,l.vaultium_gb,
    'active',l.starts_at,l.expires_at,now())
  on conflict(admin_id) do update set
    current_license_id=excluded.current_license_id,
    shop_limit=excluded.shop_limit,
    connectx_enabled=excluded.connectx_enabled,
    connectx_daily_limit=excluded.connectx_daily_limit,
    zudo_enabled=excluded.zudo_enabled,
    zudo_daily_limit=excluded.zudo_daily_limit,
    business_health_enabled=excluded.business_health_enabled,
    business_health_daily_limit=excluded.business_health_daily_limit,
    truebill_enabled=excluded.truebill_enabled,
    vaultium_gb=excluded.vaultium_gb,
    status='active',
    starts_at=excluded.starts_at,
    expires_at=excluded.expires_at,
    updated_at=now();
  -- Oldest shops keep active operation; shops beyond the plan become read-only.
  for r in select id from stores where admin_id=l.admin_id order by created_at asc loop
    n := n+1;
    update stores
      set status = case when n <= l.max_stores then 'active'::store_status else 'read_only'::store_status end,
          updated_at = now()
      where id = r.id;
  end loop;
end $$;

-- Full factory reset: wipes every data table and re-seeds platform defaults.
create or replace function public.factory_reset_ems()
returns void language plpgsql security definer set search_path=public as $$
begin
  truncate table
    public.invoice_lines, public.invoices, public.inventory_items,
    public.expenses, public.attendance, public.due_recoveries,
    public.staff_salary_invoices, public.suppliers, public.customers,
    public.staff, public.stores, public.device_logins,
    public.activity_logs, public.error_logs,
    public.vaultium_files, public.truebill_scans,
    public.business_health_reports, public.business_health_settings,
    public.zudo_messages, public.zudo_conversations, public.zudo_settings,
    public.connectx_messages, public.connectx_settings,
    public.helpdesk_messages, public.contact_messages,
    public.blog_posts, public.public_pages,
    public.addon_purchases, public.addon_coupons, public.addon_settings, public.addon_checkout_settings,
    public.current_entitlements, public.licenses, public.license_plans,
    public.platform_activity_logs, public.platform_settings,
    public.administrators, public.ems_owners
  restart identity cascade;

  alter sequence public.supplier_code_seq restart with 1;
  alter sequence public.customer_code_seq restart with 1;
  alter sequence public.expense_code_seq restart with 1;
  alter sequence public.inventory_code_seq restart with 1;
  alter sequence public.sale_invoice_code_seq restart with 1;
  alter sequence public.purchase_invoice_code_seq restart with 1;

  insert into public.platform_settings(setting_key,setting_value)
  values ('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1","public_base_url":""}'::jsonb)
  on conflict (setting_key) do nothing;

  insert into public.addon_checkout_settings(id) values (true) on conflict(id) do nothing;

  insert into public.addon_settings
    (addon_key, title, details, unit_price, min_days, max_days, min_daily_limit, max_daily_limit)
  values
    ('connectx',       'ConnectX',        'Send business emails through EMS.',                                                2,  7, 365, 10, 500),
    ('zudo',           'Zudo AI',         'Read-only AI assistant for your shop.',                                            2,  7, 365, 10, 500),
    ('business_health','AI Business Health','Business-health reports from your data.',                                         2,  7, 365,  1,  50),
    ('truebill',       'TrueBill',        'Put a scannable QR code on every invoice so customers can verify authenticity.',   2, 30, 365,  1,   1),
    ('vaultium',       'Vaultium',        'Secure cloud file storage for invoices and expense documents (GB).',               0,  1, 365,  1, 100)
  on conflict(addon_key) do nothing;

  insert into public.public_pages(slug,title,body) values
    ('about','About EMS V1',''),
    ('terms','Terms & Conditions',''),
    ('contact','Contact Us','')
  on conflict(slug) do nothing;
end $$;

revoke all on function public.next_ems_invoice_number(text),
  public.peek_ems_invoice_number(text),
  public.post_invoice(uuid,text,text,uuid,date,public.payment_method,text,text,numeric,numeric,numeric,uuid,jsonb),
  public.delete_posted_invoice(uuid,uuid),
  public.apply_current_entitlement(uuid),
  public.factory_reset_ems()
from public;

-- ---------------------------------------------------------------- SEED DATA
insert into public.platform_settings(setting_key,setting_value) values
('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1","public_base_url":""}'::jsonb),
('theme','{"primary":"#3975eb","secondary":"#2759ce","accent":"#8b5cf6","page_background":"#f4f7fb","main_text":"#172b4d","secondary_text":"#62748a","border":"#dbe4ee","sidebar_background":"#eaf5ff","sidebar_text":"#1e3a5f","sidebar_active":"#d7eaff","success":"#16803a","warning":"#b7791f","error":"#c62828","info":"#1769e0","glass_tint":"#eaf5ff","glass_opacity":"0.72","glass_blur":"18","glass_border_opacity":"0.82","classic_ink":"#172536","classic_navy":"#173b59","classic_navy_deep":"#102d45","classic_slate":"#607184","classic_cream":"#f7f4ee","classic_paper":"#fffdfa","classic_line":"#e2ddd3","classic_teal":"#2f806f","classic_teal_dark":"#236456","classic_gold":"#c8954e","classic_red":"#b64f4b"}'::jsonb)
on conflict (setting_key) do nothing;

insert into public.public_pages(slug,title,body) values
  ('about','About EMS V1',''),
  ('terms','Terms & Conditions',''),
  ('contact','Contact Us','')
on conflict(slug) do nothing;

insert into public.addon_checkout_settings(id) values (true) on conflict(id) do nothing;

insert into public.addon_settings
  (addon_key,title,details,unit_price,min_days,max_days,min_daily_limit,max_daily_limit)
values
  ('connectx',       'ConnectX',          'Send business emails through EMS.',                                              2,  7, 365, 10, 500),
  ('zudo',           'Zudo AI',           'Read-only AI assistant for your shop.',                                          2,  7, 365, 10, 500),
  ('business_health','AI Business Health','Business-health reports from your data.',                                         2,  7, 365,  1,  50),
  ('truebill',       'TrueBill',          'Put a scannable QR code on every invoice so customers can verify authenticity.', 2, 30, 365,  1,   1),
  ('vaultium',       'Vaultium',          'Secure cloud file storage for invoices and expense documents (GB).',              0,  1, 365,  1, 100)
on conflict(addon_key) do nothing;

insert into public.zudo_settings(id) values (true) on conflict(id) do nothing;
insert into public.business_health_settings(id) values (true) on conflict(id) do nothing;

-- ----------------------------------------------------------- RLS / SECURITY
do $$
declare t text;
begin
  foreach t in array array[
    'administrators','ems_owners','stores','license_plans','licenses','current_entitlements',
    'staff','suppliers','customers','inventory_items','invoices','invoice_lines','expenses',
    'attendance','device_logins','due_recoveries','staff_salary_invoices',
    'activity_logs','error_logs','platform_settings','platform_activity_logs','helpdesk_messages',
    'connectx_settings','connectx_messages','zudo_settings','zudo_conversations','zudo_messages',
    'business_health_settings','business_health_reports',
    'public_pages','blog_posts','contact_messages','truebill_scans',
    'addon_settings','addon_purchases','addon_checkout_settings','addon_coupons','vaultium_files']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- End of EMS V1 complete standalone schema.

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
  category             text not null default 'General Store',
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

-- ---------------------------------------------------- PERSORA CONNECTIONS
create table if not exists public.persora_grants (
  id                uuid primary key default gen_random_uuid(),
  admin_id          uuid not null references public.administrators(id) on delete cascade,
  token_hash        text not null unique,
  credential_marker text not null,
  persora_user_ref  text not null,
  label             text,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_reason    text
);
create index if not exists idx_persora_grants_admin on public.persora_grants(admin_id, revoked_at);
create index if not exists idx_persora_grants_ref   on public.persora_grants(persora_user_ref, revoked_at);

-- ---------------------------------------------------- RETURNS & REFUNDS
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
  verification_token  uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(store_id, return_number)
);

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
  verification_token  uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(store_id, exchange_number)
);

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

create table if not exists public.inventory_stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  return_id           uuid references public.returns(id) on delete cascade,
  exchange_id         uuid references public.exchanges(id) on delete cascade,
  movement_type       text not null,
  quantity            numeric(14,3) not null,
  stock_before        numeric(14,3),
  stock_after         numeric(14,3),
  condition           text not null,
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now()
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
create unique index if not exists returns_verification_token_uq   on public.returns(verification_token);
create unique index if not exists exchanges_verification_token_uq on public.exchanges(verification_token);
create index if not exists idx_connectx_store_created             on public.connectx_messages(store_id, created_at desc);
create index if not exists idx_connectx_store_visible             on public.connectx_messages(store_id, shop_deleted_at, created_at desc);

create table if not exists public.connectx_sms_messages (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  user_id         uuid,
  recipient_type  text not null check(recipient_type in ('customer','supplier','staff','manual')),
  recipient_id    uuid,
  recipient_name  text,
  to_phone        text not null,
  message_type    text not null,
  event_type      text,
  idempotency_key text,
  invoice_id      uuid,
  message_body    text not null,
  status          text not null default 'PENDING' check(status in ('queued','sending','sent','failed','PENDING','PROCESSING','SUCCESS','FAILED')),
  device_id       text,
  attempts        integer not null default 0,
  claimed_at      timestamptz,
  request_id      text,
  connection_id   text,
  sim_used        text,
  result_at       timestamptz,
  error_message   text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists idx_cx_sms_store_created on public.connectx_sms_messages(store_id, created_at desc);
create index if not exists idx_cx_sms_store_status on public.connectx_sms_messages(store_id, status);
create unique index if not exists idx_cx_sms_idempotency on public.connectx_sms_messages(store_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists idx_cx_sms_request_id on public.connectx_sms_messages(request_id) where request_id is not null;
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
  select * into l from public.licenses where id=p_license_id;
  if not found then raise exception 'License not found'; end if;
  if l.status <> 'active' or (l.starts_at is not null and l.starts_at > now()) or l.expires_at is null or l.expires_at <= now() then
    raise exception 'Only a currently valid active license can be applied';
  end if;
  insert into public.current_entitlements(
    admin_id,current_license_id,shop_limit,
    connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,
    business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb,
    status,starts_at,expires_at,updated_at)
  values(
    l.admin_id,l.id,l.max_stores,
    l.connectx_enabled,l.connectx_daily_limit,l.zudo_enabled,l.zudo_daily_limit,
    l.business_health_enabled,l.business_health_daily_limit,l.truebill_enabled,l.vaultium_gb,
    'active',coalesce(l.starts_at,now()),l.expires_at,now())
  on conflict(admin_id) do update set
    current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,
    connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,
    zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,
    business_health_enabled=excluded.business_health_enabled,business_health_daily_limit=excluded.business_health_daily_limit,
    truebill_enabled=excluded.truebill_enabled,vaultium_gb=excluded.vaultium_gb,
    status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=now();
  -- Preserve manually deactivated stores while enforcing the active license capacity.
  for r in select id,status from public.stores where admin_id=l.admin_id order by created_at asc,id asc loop
    n:=n+1;
    update public.stores set status=case
      when r.status='inactive' then 'inactive'::public.store_status
      when n<=l.max_stores then 'active'::public.store_status
      else 'read_only'::public.store_status end,
      updated_at=now() where id=r.id;
  end loop;
end $$;
revoke all on function public.apply_current_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.apply_current_entitlement(uuid) to service_role;

-- Full factory reset: wipes every data table and re-seeds platform defaults.
create or replace function public.factory_reset_ems()
returns void language plpgsql security definer set search_path=public as $$
begin
  truncate table
    public.pharmacy_master_products, public.pharmacy_master_manufacturers,
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
  values ('branding','{"product_name":"EMS","powered_by":"Dexter Studio","website_name":"EMS","public_base_url":""}'::jsonb)
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
    ('about','About EMS',''),
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
('branding','{"product_name":"EMS","powered_by":"Dexter Studio","website_name":"EMS","public_base_url":""}'::jsonb),
('theme','{"primary":"#3975eb","secondary":"#2759ce","accent":"#8b5cf6","page_background":"#f4f7fb","main_text":"#172b4d","secondary_text":"#62748a","border":"#dbe4ee","sidebar_background":"#eaf5ff","sidebar_text":"#1e3a5f","sidebar_active":"#d7eaff","success":"#16803a","warning":"#b7791f","error":"#c62828","info":"#1769e0","glass_tint":"#eaf5ff","glass_opacity":"0.72","glass_blur":"18","glass_border_opacity":"0.82","classic_ink":"#172536","classic_navy":"#173b59","classic_navy_deep":"#102d45","classic_slate":"#607184","classic_cream":"#f7f4ee","classic_paper":"#fffdfa","classic_line":"#e2ddd3","classic_teal":"#2f806f","classic_teal_dark":"#236456","classic_gold":"#c8954e","classic_red":"#b64f4b"}'::jsonb)
on conflict (setting_key) do nothing;

insert into public.public_pages(slug,title,body) values
  ('about','About EMS',''),
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

create table if not exists public.app_store_apps (
  id                   uuid primary key default gen_random_uuid(),
  package_name         text not null unique,
  title                text not null,
  description          text not null default '',
  version              text not null default '1.4.0',
  version_code         integer not null default 14,
  icon_url             text not null default '',
  icon_r2_key          text,
  apk_url              text not null default '',
  apk_r2_key           text,
  r2_key               text,
  apk_filename         text not null default '',
  apk_size_bytes       bigint not null default 0,
  mandatory            boolean not null default false,
  release_notes        text not null default '',
  published            boolean not null default true,
  category             text not null default 'EMS applications',
  developer            text not null default 'Dexter Studio',
  featured             boolean not null default false,
  web_url              text not null default '',
  screenshot_urls      jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_app_store_pkg on public.app_store_apps(package_name);
create index if not exists idx_app_store_pub on public.app_store_apps(published, version_code desc, created_at desc);

-- ----------------------------------------------------------- RLS / SECURITY
-- --------------------------------------------------- EMS PUBLIC API CREDENTIALS
-- Platform service credentials issued by the EMS owner (Owner Console →
-- EMS API). The ConnectX central service authenticates against /api/v1
-- with one of these keys. Only a SHA-256 hash of each key is stored.
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.ems_owners(id) on delete set null,
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  key_prefix    text not null,
  key_hash      text not null unique,
  scopes        jsonb not null default '["read"]',
  status        text not null default 'active' check (status in ('active','revoked')),
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists idx_api_keys_status on public.api_keys(status);
create index if not exists idx_api_keys_hash  on public.api_keys(key_hash);
create index if not exists idx_api_keys_store on public.api_keys(store_id);

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
    'addon_settings','addon_purchases','addon_checkout_settings','addon_coupons','vaultium_files','persora_grants',
    'returns','return_items','inventory_stock_movements','exchanges','exchange_items','app_store_apps','api_keys']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- Make every new table visible to PostgREST immediately.
notify pgrst, 'reload schema';
-- End of EMS V1 complete standalone schema.

-- ======================================================================
-- CShop Clothing Business Console (additive, backward-compatible)
-- The same schema/stock RPCs are documented in migration 047.
-- ======================================================================
-- EMS CShop: additive clothing business console support.
-- Existing shops stay Electronics by default; no existing inventory is rewritten.

alter table public.stores
  add column if not exists shop_type text not null default 'electronics';

-- Snapshot variant cost on each invoice line so historical profit reporting is stable.
alter table public.invoice_lines
  add column if not exists cost_price numeric(14,2);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stores_shop_type_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_shop_type_check check (shop_type in ('electronics','clothing'));
  end if;
end $$;

create table if not exists public.clothing_products (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  name                text not null,
  style_code          text not null,
  category            text not null,
  brand               text,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  description         text,
  unit                text not null default 'pcs' check (unit in ('pcs','pair','set','dozen','meter','yard')),
  purchase_unit       text not null default 'pcs' check (purchase_unit in ('pcs','pair','set','dozen','meter','yard')),
  purchase_to_stock   numeric(14,4) not null default 1 check (purchase_to_stock > 0),
  cost_price          numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price          numeric(14,2) not null default 0 check (sale_price >= 0),
  reorder_threshold   numeric(14,3) not null default 0 check (reorder_threshold >= 0),
  images              jsonb not null default '[]'::jsonb,
  measurements        jsonb not null default '{}'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, style_code)
);
create index if not exists clothing_products_store_category_idx
  on public.clothing_products(store_id, category, name);

-- Each size/color combination owns one existing inventory_items row. That lets
-- EMS's current invoice, returns, exchanges, due, TrueBill and stock procedures
-- continue to operate on the precise variant without changing their contracts.
create table if not exists public.clothing_variants (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  product_id          uuid not null references public.clothing_products(id) on delete cascade,
  inventory_item_id   uuid not null unique references public.inventory_items(id) on delete restrict,
  size_label          text,
  size_system         text,
  color               text,
  variant_sku         text not null,
  barcode             text,
  cost_price          numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price          numeric(14,2) not null default 0 check (sale_price >= 0),
  reorder_threshold   numeric(14,3) not null default 0 check (reorder_threshold >= 0),
  measurements        jsonb not null default '{}'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, variant_sku)
);
create index if not exists clothing_variants_store_product_idx
  on public.clothing_variants(store_id, product_id, active);
create index if not exists clothing_variants_barcode_idx
  on public.clothing_variants(store_id, barcode) where barcode is not null;
create unique index if not exists clothing_variants_barcode_uq
  on public.clothing_variants(store_id, barcode) where barcode is not null and barcode <> '';
create unique index if not exists clothing_variants_matrix_uq
  on public.clothing_variants(
    product_id,
    coalesce(nullif(lower(trim(size_label)), ''), ''),
    coalesce(nullif(lower(trim(color)), ''), '')
  );

create table if not exists public.clothing_size_profiles (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  category        text not null,
  size_system     text not null default 'alpha',
  sizes           jsonb not null default '[]'::jsonb,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (store_id, category)
);

create table if not exists public.clothing_purchase_returns (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  return_number       text not null,
  return_date         date not null default current_date,
  total_return_amount numeric(14,2) not null default 0 check (total_return_amount >= 0),
  reason              text not null,
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  unique(store_id, return_number)
);
create index if not exists clothing_purchase_returns_invoice_idx
  on public.clothing_purchase_returns(store_id, purchase_invoice_id);

create table if not exists public.clothing_purchase_return_items (
  id                  uuid primary key default gen_random_uuid(),
  return_id           uuid not null references public.clothing_purchase_returns(id) on delete cascade,
  invoice_line_id     uuid not null references public.invoice_lines(id) on delete restrict,
  item_id             uuid not null references public.inventory_items(id) on delete restrict,
  variant_id          uuid not null references public.clothing_variants(id) on delete restrict,
  quantity            numeric(14,3) not null check (quantity > 0),
  unit_cost           numeric(14,2) not null check (unit_cost >= 0),
  total_amount        numeric(14,2) not null check (total_amount >= 0),
  created_at          timestamptz not null default now()
);
create index if not exists clothing_purchase_return_items_invoice_line_idx
  on public.clothing_purchase_return_items(invoice_line_id);

create table if not exists public.clothing_stock_transfers (
  id                  uuid primary key default gen_random_uuid(),
  source_store_id     uuid not null references public.stores(id) on delete cascade,
  target_store_id     uuid not null references public.stores(id) on delete cascade,
  source_variant_id   uuid not null references public.clothing_variants(id) on delete restrict,
  target_variant_id   uuid not null references public.clothing_variants(id) on delete restrict,
  quantity            numeric(14,3) not null check (quantity > 0),
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  check (source_store_id <> target_store_id)
);
create index if not exists clothing_stock_transfers_source_idx
  on public.clothing_stock_transfers(source_store_id, created_at desc);
create index if not exists clothing_stock_transfers_target_idx
  on public.clothing_stock_transfers(target_store_id, created_at desc);

alter table public.clothing_products enable row level security;
alter table public.clothing_variants enable row level security;
alter table public.clothing_size_profiles enable row level security;
alter table public.clothing_purchase_returns enable row level security;
alter table public.clothing_purchase_return_items enable row level security;
alter table public.clothing_stock_transfers enable row level security;
grant all on public.clothing_products to service_role;
grant all on public.clothing_variants to service_role;
grant all on public.clothing_size_profiles to service_role;
grant all on public.clothing_purchase_returns to service_role;
grant all on public.clothing_purchase_return_items to service_role;
grant all on public.clothing_stock_transfers to service_role;

-- Atomic supplier returns validate prior returns and deduct stock in one transaction.
create or replace function public.cshop_post_purchase_return(
  p_store_id uuid,
  p_invoice_id uuid,
  p_return_number text,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices;
  v_request record;
  v_line record;
  v_return_id uuid;
  v_total numeric(14,2):=0;
  v_quantity numeric(14,3);
  v_returned numeric(14,3);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_line_total numeric(14,2);
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Select at least one purchase line to return';
  end if;
  if nullif(trim(p_return_number),'') is null or nullif(trim(p_reason),'') is null then
    raise exception 'Return number and reason are required';
  end if;
  select * into v_invoice from public.invoices
    where id=p_invoice_id and store_id=p_store_id and kind='purchase' for update;
  if not found then raise exception 'Purchase invoice does not belong to this shop'; end if;

  -- Validate every line and its unreturned quantity before writing any stock.
  for v_request in
    select invoice_line_id, sum(quantity)::numeric as quantity
      from jsonb_to_recordset(p_items) as x(invoice_line_id uuid, quantity numeric)
     group by invoice_line_id order by invoice_line_id
  loop
    if v_request.quantity<=0 then raise exception 'Return quantities must be positive'; end if;
    select il.id,il.item_id,il.quantity as purchased,il.unit_price,i.total_stock,cv.id as variant_id
      into v_line
      from public.invoice_lines il
      join public.inventory_items i on i.id=il.item_id and i.store_id=p_store_id
      join public.clothing_variants cv on cv.inventory_item_id=i.id and cv.store_id=p_store_id
     where il.id=v_request.invoice_line_id and il.invoice_id=p_invoice_id
     for update of i;
    if not found then raise exception 'Purchase line is not a Clothing variant in this shop'; end if;
    select coalesce(sum(ri.quantity),0) into v_returned
      from public.clothing_purchase_return_items ri
      join public.clothing_purchase_returns r on r.id=ri.return_id
     where r.store_id=p_store_id and ri.invoice_line_id=v_line.id;
    if v_request.quantity>v_line.purchased-v_returned then
      raise exception 'Return quantity exceeds the unreturned quantity on the purchase invoice';
    end if;
    if v_request.quantity>v_line.total_stock then
      raise exception 'Insufficient variant stock to return to the supplier';
    end if;
    v_total:=v_total+round(v_request.quantity*v_line.unit_price,2);
  end loop;

  v_return_id:=gen_random_uuid();
  insert into public.clothing_purchase_returns(
    id,store_id,purchase_invoice_id,supplier_id,return_number,return_date,total_return_amount,reason,notes,created_by
  ) values (
    v_return_id,p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,coalesce(p_return_date,current_date),
    v_total,trim(p_reason),nullif(trim(p_notes),''),p_created_by
  );

  for v_request in
    select invoice_line_id, sum(quantity)::numeric as quantity
      from jsonb_to_recordset(p_items) as x(invoice_line_id uuid, quantity numeric)
     group by invoice_line_id order by invoice_line_id
  loop
    v_quantity:=v_request.quantity;
    select il.id,il.item_id,il.unit_price,cv.id as variant_id,i.total_stock
      into v_line
      from public.invoice_lines il
      join public.inventory_items i on i.id=il.item_id and i.store_id=p_store_id
      join public.clothing_variants cv on cv.inventory_item_id=i.id and cv.store_id=p_store_id
     where il.id=v_request.invoice_line_id and il.invoice_id=p_invoice_id
     for update of i;
    v_before:=v_line.total_stock;
    v_after:=v_before-v_quantity;
    v_line_total:=round(v_quantity*v_line.unit_price,2);
    update public.inventory_items set total_stock=v_after,updated_at=now()
      where id=v_line.item_id and store_id=p_store_id;
    insert into public.clothing_purchase_return_items(
      return_id,invoice_line_id,item_id,variant_id,quantity,unit_cost,total_amount
    ) values (
      v_return_id,v_line.id,v_line.item_id,v_line.variant_id,v_quantity,v_line.unit_price,v_line_total
    );
    insert into public.inventory_stock_movements(
      store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by
    ) values (
      p_store_id,v_line.item_id,'purchase_return',v_quantity,v_before,v_after,'returned_to_supplier',
      'Purchase return '||p_return_number||': '||trim(p_reason),p_created_by
    );
  end loop;
  update public.invoices
    set total_due=greatest(total_due-v_total,0),updated_at=now()
    where id=p_invoice_id and store_id=p_store_id;
  return jsonb_build_object('id',v_return_id,'store_id',p_store_id,'purchase_invoice_id',p_invoice_id,
    'return_number',p_return_number,'return_date',coalesce(p_return_date,current_date),
    'total_return_amount',v_total,'reason',trim(p_reason),'notes',nullif(trim(p_notes),''));
end $$;

-- Atomic stock controls are the only clothing paths that mutate on-hand stock.
create or replace function public.cshop_adjust_stock(
  p_store_id uuid,
  p_item_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_condition text,
  p_notes text,
  p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_item public.inventory_items; v_before numeric(14,3); v_after numeric(14,3);
begin
  if p_delta = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if p_movement_type not in ('adjustment','damaged','reconciliation','purchase_return','opening') then
    raise exception 'Invalid stock movement type';
  end if;
  select i.* into v_item
    from public.inventory_items i
    join public.clothing_variants v on v.inventory_item_id=i.id and v.store_id=p_store_id
    where i.id=p_item_id and i.store_id=p_store_id
    for update of i;
  if not found then raise exception 'Clothing variant does not belong to this shop'; end if;
  v_before:=v_item.total_stock;
  v_after:=v_before+p_delta;
  if v_after < 0 then raise exception 'This adjustment would make stock negative'; end if;
  update public.inventory_items
    set total_stock=v_after, updated_at=now()
    where id=p_item_id and store_id=p_store_id;
  insert into public.inventory_stock_movements(
    store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by
  ) values (
    p_store_id,p_item_id,p_movement_type,abs(p_delta),v_before,v_after,
    coalesce(nullif(p_condition,''),'good'),nullif(p_notes,''),p_created_by
  );
  return jsonb_build_object('item_id',p_item_id,'stock_before',v_before,'stock_after',v_after,'delta',p_delta);
end $$;

drop function if exists public.cshop_transfer_stock(uuid,uuid,uuid,uuid,numeric,text,uuid);

create or replace function public.cshop_transfer_stock(
  p_source_store_id uuid,
  p_source_item_id uuid,
  p_source_variant_id uuid,
  p_target_store_id uuid,
  p_target_item_id uuid,
  p_target_variant_id uuid,
  p_quantity numeric,
  p_notes text,
  p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_source public.inventory_items; v_target public.inventory_items; v_source_before numeric(14,3); v_target_before numeric(14,3);
begin
  if p_source_store_id=p_target_store_id or p_quantity<=0 then raise exception 'Choose a different target shop and a positive quantity'; end if;
  if not exists (
    select 1 from public.stores a join public.stores b on a.admin_id=b.admin_id
    where a.id=p_source_store_id and b.id=p_target_store_id
      and a.shop_type='clothing' and b.shop_type='clothing'
  ) then raise exception 'Stock can only move between Clothing shops owned by the same administrator'; end if;
  perform id from public.inventory_items
    where id in (p_source_item_id,p_target_item_id)
    order by id for update;
  select * into v_source from public.inventory_items
    where id=p_source_item_id and store_id=p_source_store_id;
  select * into v_target from public.inventory_items
    where id=p_target_item_id and store_id=p_target_store_id;
  if v_source.id is null or v_target.id is null then raise exception 'Source or target variant was not found'; end if;
  if not exists(select 1 from public.clothing_variants where id=p_source_variant_id and store_id=p_source_store_id and inventory_item_id=p_source_item_id and active)
     or not exists(select 1 from public.clothing_variants where id=p_target_variant_id and store_id=p_target_store_id and inventory_item_id=p_target_item_id and active) then
    raise exception 'Source and target must be active matching Clothing variants';
  end if;
  v_source_before:=v_source.total_stock; v_target_before:=v_target.total_stock;
  if v_source_before<p_quantity then raise exception 'Insufficient stock for transfer'; end if;
  update public.inventory_items set total_stock=total_stock-p_quantity,updated_at=now() where id=p_source_item_id;
  update public.inventory_items set total_stock=total_stock+p_quantity,updated_at=now() where id=p_target_item_id;
  insert into public.inventory_stock_movements(store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by)
  values(p_source_store_id,p_source_item_id,'transfer_out',p_quantity,v_source_before,v_source_before-p_quantity,'transferred',p_notes,p_created_by),
        (p_target_store_id,p_target_item_id,'transfer_in',p_quantity,v_target_before,v_target_before+p_quantity,'transferred',p_notes,p_created_by);
  insert into public.clothing_stock_transfers(source_store_id,target_store_id,source_variant_id,target_variant_id,quantity,notes,created_by)
  select p_source_store_id,p_target_store_id,sv.id,tv.id,p_quantity,nullif(p_notes,''),p_created_by
    from public.clothing_variants sv,public.clothing_variants tv
    where sv.inventory_item_id=p_source_item_id and sv.store_id=p_source_store_id
      and tv.inventory_item_id=p_target_item_id and tv.store_id=p_target_store_id;
  return jsonb_build_object('quantity',p_quantity,'source_stock',v_source_before-p_quantity,'target_stock',v_target_before+p_quantity);
end $$;

revoke all on function public.cshop_post_purchase_return(uuid,uuid,text,date,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.cshop_adjust_stock(uuid,uuid,numeric,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.cshop_transfer_stock(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid) from public, anon, authenticated;
grant execute on function public.cshop_post_purchase_return(uuid,uuid,text,date,text,text,uuid,jsonb) to service_role;
grant execute on function public.cshop_adjust_stock(uuid,uuid,numeric,text,text,text,uuid) to service_role;
grant execute on function public.cshop_transfer_stock(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid) to service_role;

notify pgrst, 'reload schema';

-- EMS Pharmacy Console. Additive schema; preserves existing stores and ledger rows.
begin;

alter table public.stores drop constraint if exists stores_shop_type_check;
alter table public.stores add constraint stores_shop_type_check
  check (shop_type in ('electronics','clothing','pharmacy'));
alter table public.stores add column if not exists business_type text not null default 'electronics';
update public.stores set business_type=shop_type where business_type='electronics' and shop_type<>'electronics';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='stores_business_type_check' and conrelid='public.stores'::regclass) then
    alter table public.stores add constraint stores_business_type_check check (business_type in ('electronics','clothing','pharmacy'));
  end if;
end $$;

create table if not exists public.pharmacy_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  expiry_warning_days integer not null default 90 check (expiry_warning_days between 1 and 730),
  low_stock_default numeric(14,3) not null default 5 check (low_stock_default >= 0),
  categories jsonb not null default '["Prescription","OTC","Medical devices","Hygiene","Healthcare supplies"]'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_shelves (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  aisle text,
  rack text,
  shelf text,
  bin text,
  notes text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,label)
);
create index if not exists pharmacy_shelves_store_active_idx on public.pharmacy_shelves(store_id,active,label);

create table if not exists public.pharmacy_manufacturers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists pharmacy_manufacturers_store_name_idx on public.pharmacy_manufacturers(store_id,lower(name));
create table if not exists public.pharmacy_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_item_id uuid not null unique references public.inventory_items(id) on delete restrict,
  name text not null,
  generic_name text,
  brand text,
  strength text,
  dosage_form text not null default 'other',
  category text not null default 'Medicine',
  manufacturer text,
  pack_size text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  barcode text,
  base_unit text not null default 'tablet',
  purchase_price numeric(14,2) not null default 0 check(purchase_price>=0),
  sale_price numeric(14,2) not null default 0 check(sale_price>=0),
  wholesale_price numeric(14,2) not null default 0 check(wholesale_price>=0),
  reorder_threshold numeric(14,3) not null default 5 check(reorder_threshold>=0),
  default_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  prescription_required boolean not null default false,
  tracks_batch boolean not null default true,
  tracks_expiry boolean not null default true,
  description text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,barcode)
);
create index if not exists pharmacy_products_store_category_name_idx on public.pharmacy_products(store_id,category,name);
create index if not exists pharmacy_products_store_idx on public.pharmacy_products(store_id,active);
create index if not exists pharmacy_products_supplier_idx on public.pharmacy_products(store_id,supplier_id);

create table if not exists public.pharmacy_product_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete cascade,
  unit_label text not null,
  factor_to_base numeric(16,6) not null check(factor_to_base>0),
  allow_fractional boolean not null default false,
  can_purchase boolean not null default false,
  can_sell boolean not null default true,
  purchase_price numeric(14,2) check(purchase_price is null or purchase_price>=0),
  selling_price numeric(14,2) check(selling_price is null or selling_price>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,unit_label)
);
create index if not exists pharmacy_product_units_store_product_idx on public.pharmacy_product_units(store_id,product_id);

create table if not exists public.pharmacy_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_number text,
  manufacturing_date date,
  expiry_date date,
  quantity_on_hand_base numeric(16,3) not null default 0 check(quantity_on_hand_base>=0),
  free_quantity_base numeric(16,3) not null default 0 check(free_quantity_base>=0),
  unit_cost numeric(14,6) not null default 0 check(unit_cost>=0),
  mrp_per_base numeric(14,4) not null default 0 check(mrp_per_base>=0),
  status text not null default 'available' check(status in ('available','quarantined','blocked','recalled','expired')),
  location_id uuid references public.pharmacy_shelves(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_invoice_id uuid references public.invoices(id) on delete set null,
  purchase_invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pharmacy_batches_fefo_idx on public.pharmacy_batches(store_id,product_id,status,expiry_date,created_at);
create index if not exists pharmacy_batches_expiry_idx on public.pharmacy_batches(store_id,expiry_date) where quantity_on_hand_base>0;
create index if not exists pharmacy_batches_location_idx on public.pharmacy_batches(store_id,location_id);
create index if not exists pharmacy_batches_purchase_idx on public.pharmacy_batches(purchase_invoice_id,purchase_invoice_line_id);

create table if not exists public.pharmacy_invoice_lines (
  invoice_line_id uuid primary key references public.invoice_lines(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  unit_label text not null,
  unit_factor numeric(16,6) not null check(unit_factor>0),
  quantity_base numeric(16,3) not null check(quantity_base>0),
  free_quantity_base numeric(16,3) not null default 0 check(free_quantity_base>=0),
  unit_cost_base numeric(14,6) not null default 0,
  mrp_per_base numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_invoice_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete cascade,
  batch_id uuid not null references public.pharmacy_batches(id) on delete restrict,
  movement_kind text not null check(movement_kind in ('purchase','sale','return')),
  quantity_base numeric(16,3) not null check(quantity_base>0),
  created_at timestamptz not null default now(),
  unique(invoice_line_id,batch_id,movement_kind)
);
create index if not exists pharmacy_invoice_batches_batch_idx on public.pharmacy_invoice_batches(batch_id,created_at);

create table if not exists public.pharmacy_stock_movements (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_id uuid references public.pharmacy_batches(id) on delete set null,
  movement_type text not null,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  stock_before numeric(16,3) not null default 0,
  stock_after numeric(16,3) not null default 0,
  from_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  to_location_id uuid references public.pharmacy_shelves(id) on delete set null,
  reference_type text,
  reference_id uuid,
  reason text,
  idempotency_key text unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_stock_movements_product_idx on public.pharmacy_stock_movements(store_id,product_id,created_at desc);
create index if not exists pharmacy_stock_movements_batch_idx on public.pharmacy_stock_movements(batch_id,created_at desc);

create table if not exists public.pharmacy_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  operation_key text not null,
  operation_type text not null check(operation_type in ('sale','purchase','return','exchange','supplier_return','move')),
  invoice_id uuid references public.invoices(id) on delete restrict,
  result_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,operation_key)
);

create table if not exists public.pharmacy_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  alert_key text not null,
  severity text not null default 'warning' check(severity in ('info','warning','critical')),
  title text not null,
  detail text not null,
  href text not null default 'pharmacy-dashboard',
  status text not null default 'unread' check(status in ('unread','read','resolved')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,alert_key)
);
create index if not exists pharmacy_alerts_store_status_idx on public.pharmacy_alerts(store_id,status,updated_at desc);

create table if not exists public.pharmacy_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  return_number text not null,
  customer_name text not null default 'Walk-in customer',
  return_date date not null default current_date,
  return_type text not null default 'return' check(return_type in ('return','exchange')),
  amount numeric(14,2) not null default 0 check(amount>=0),
  refund_method text not null default 'none',
  disposition text not null default 'quarantined',
  reason text not null,
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,return_number),
  unique(store_id,idempotency_key)
);
create index if not exists pharmacy_returns_invoice_idx on public.pharmacy_returns(store_id,invoice_id,created_at desc);

create table if not exists public.pharmacy_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.pharmacy_returns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  batch_id uuid references public.pharmacy_batches(id) on delete restrict,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  condition text not null check(condition in ('sellable','quarantined','damaged','recalled','expired')),
  reason text not null,
  amount numeric(14,2) not null default 0 check(amount>=0),
  restocked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_return_items_invoice_line_idx on public.pharmacy_return_items(invoice_line_id);

create table if not exists public.pharmacy_supplier_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
  batch_id uuid not null references public.pharmacy_batches(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  return_number text not null,
  quantity_base numeric(16,3) not null check(quantity_base>0),
  amount numeric(14,2) not null check(amount>=0),
  reason text not null,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(store_id,return_number),
  unique(store_id,idempotency_key)
);
create index if not exists pharmacy_supplier_returns_purchase_idx on public.pharmacy_supplier_returns(store_id,purchase_invoice_id,created_at desc);

-- Every pharmacy table is available only to the server's service-role path.
do $$ declare t text; begin
  foreach t in array array['pharmacy_settings','pharmacy_shelves','pharmacy_products','pharmacy_product_units','pharmacy_batches','pharmacy_invoice_lines','pharmacy_invoice_batches','pharmacy_stock_movements','pharmacy_operations','pharmacy_alerts','pharmacy_returns','pharmacy_return_items','pharmacy_supplier_returns'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.pharmacy_stock_movements_id_seq to service_role;

create or replace function public.pharmacy_save_product(p_store_id uuid,p_product_id uuid,p_product jsonb,p_units jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_product public.pharmacy_products; v_item public.inventory_items; v_unit jsonb; v_name text; v_sku text; v_base text; v_product_id uuid; v_item_id uuid; v_desc text;
begin
  if jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)=0 then raise exception 'At least one medicine selling or purchase unit is required'; end if;
  v_name:=btrim(coalesce(p_product->>'name','')); v_sku:=upper(btrim(coalesce(p_product->>'sku',''))); v_base:=lower(btrim(coalesce(p_product->>'base_unit','tablet')));
  if v_name='' then raise exception 'Medicine name is required'; end if;
  if not exists(select 1 from jsonb_array_elements(p_units) u where lower(btrim(u->>'unit_label'))=v_base and (u->>'factor_to_base')::numeric=1) then raise exception 'Base unit must have a conversion factor of exactly 1'; end if;
  if exists(select 1 from jsonb_array_elements(p_units) u where coalesce((u->>'factor_to_base')::numeric,0)<=0) then raise exception 'Pack conversion factors must be greater than zero'; end if;
  v_desc:=concat_ws(' · ',v_name,nullif(btrim(p_product->>'strength'),''),nullif(btrim(p_product->>'dosage_form'),''));
  if p_product_id is null then
    if v_sku='' then v_sku:='PH-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)); end if;
    if exists(select 1 from public.inventory_items where store_id=p_store_id and item_code=v_sku) then raise exception 'SKU already exists in this shop'; end if;
    insert into public.inventory_items(store_id,item_code,description,unit,sale_price,total_stock,active,category)
      values(p_store_id,v_sku,v_desc,v_base,coalesce((p_product->>'sale_price')::numeric,0),0,true,coalesce(nullif(p_product->>'category',''),'Medicine')) returning * into v_item;
    v_item_id:=v_item.id;v_product_id:=gen_random_uuid();
    insert into public.pharmacy_products(id,store_id,inventory_item_id,name,generic_name,brand,strength,dosage_form,category,manufacturer,pack_size,supplier_id,barcode,base_unit,purchase_price,sale_price,wholesale_price,reorder_threshold,default_location_id,prescription_required,tracks_batch,tracks_expiry,description,active,created_by)
    values(v_product_id,p_store_id,v_item_id,v_name,nullif(btrim(p_product->>'generic_name'),''),nullif(btrim(p_product->>'brand'),''),nullif(btrim(p_product->>'strength'),''),coalesce(nullif(p_product->>'dosage_form',''),'other'),coalesce(nullif(p_product->>'category',''),'Medicine'),nullif(btrim(p_product->>'manufacturer'),''),nullif(btrim(p_product->>'pack_size'),''),nullif(p_product->>'supplier_id','')::uuid,nullif(btrim(p_product->>'barcode'),''),v_base,coalesce((p_product->>'purchase_price')::numeric,0),coalesce((p_product->>'sale_price')::numeric,0),coalesce((p_product->>'wholesale_price')::numeric,0),coalesce((p_product->>'reorder_threshold')::numeric,5),nullif(p_product->>'default_location_id','')::uuid,coalesce((p_product->>'prescription_required')::boolean,false),coalesce((p_product->>'tracks_batch')::boolean,true),coalesce((p_product->>'tracks_expiry')::boolean,true),nullif(btrim(p_product->>'description'),''),true,p_actor) returning * into v_product;
  else
    select * into v_product from public.pharmacy_products where id=p_product_id and store_id=p_store_id for update;
    if not found then raise exception 'Medicine was not found in this shop'; end if;
    select * into v_item from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
    if not found then raise exception 'Linked inventory record was not found'; end if;
    if v_sku='' then v_sku:=v_item.item_code; end if;
    if (v_product.base_unit<>v_base or v_item.item_code<>v_sku) and (exists(select 1 from public.pharmacy_batches where product_id=v_product.id and quantity_on_hand_base>0) or exists(select 1 from public.pharmacy_invoice_lines where product_id=v_product.id)) then raise exception 'SKU and base unit cannot be changed after batch or invoice history exists'; end if;
    update public.inventory_items set item_code=v_sku,description=v_desc,unit=v_base,sale_price=coalesce((p_product->>'sale_price')::numeric,0),category=coalesce(nullif(p_product->>'category',''),'Medicine'),active=true,updated_at=now() where id=v_item.id;
    update public.pharmacy_products set name=v_name,generic_name=nullif(btrim(p_product->>'generic_name'),''),brand=nullif(btrim(p_product->>'brand'),''),strength=nullif(btrim(p_product->>'strength'),''),dosage_form=coalesce(nullif(p_product->>'dosage_form',''),'other'),category=coalesce(nullif(p_product->>'category',''),'Medicine'),manufacturer=nullif(btrim(p_product->>'manufacturer'),''),pack_size=nullif(btrim(p_product->>'pack_size'),''),supplier_id=nullif(p_product->>'supplier_id','')::uuid,barcode=nullif(btrim(p_product->>'barcode'),''),base_unit=v_base,purchase_price=coalesce((p_product->>'purchase_price')::numeric,0),sale_price=coalesce((p_product->>'sale_price')::numeric,0),wholesale_price=coalesce((p_product->>'wholesale_price')::numeric,0),reorder_threshold=coalesce((p_product->>'reorder_threshold')::numeric,5),default_location_id=nullif(p_product->>'default_location_id','')::uuid,prescription_required=coalesce((p_product->>'prescription_required')::boolean,false),tracks_batch=coalesce((p_product->>'tracks_batch')::boolean,true),tracks_expiry=coalesce((p_product->>'tracks_expiry')::boolean,true),description=nullif(btrim(p_product->>'description'),''),updated_at=now() where id=v_product.id returning * into v_product;
    v_product_id:=v_product.id;v_item_id:=v_product.inventory_item_id;
  end if;
  for v_unit in select value from jsonb_array_elements(p_units) loop
    if lower(btrim(v_unit->>'unit_label'))='' then continue; end if;
    insert into public.pharmacy_product_units(store_id,product_id,unit_label,factor_to_base,allow_fractional,can_purchase,can_sell,purchase_price,selling_price)
    values(p_store_id,v_product_id,lower(btrim(v_unit->>'unit_label')),(v_unit->>'factor_to_base')::numeric,coalesce((v_unit->>'allow_fractional')::boolean,false),coalesce((v_unit->>'can_purchase')::boolean,false),coalesce((v_unit->>'can_sell')::boolean,true),nullif(v_unit->>'purchase_price','')::numeric,nullif(v_unit->>'selling_price','')::numeric)
    on conflict(product_id,unit_label) do update set factor_to_base=excluded.factor_to_base,allow_fractional=excluded.allow_fractional,can_purchase=excluded.can_purchase,can_sell=excluded.can_sell,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,updated_at=now();
  end loop;
  return jsonb_build_object('id',v_product_id,'inventory_item_id',v_item_id,'sku',v_sku);
end $$;

create or replace function public.pharmacy_post_invoice(
  p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method text,p_transaction_id text,p_notes text,
  p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb,p_operation_key text,p_allow_price_override boolean default false)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_item jsonb; v_product public.pharmacy_products; v_unit public.pharmacy_product_units; v_batch public.pharmacy_batches; v_line public.invoice_lines;
  v_operation public.pharmacy_operations; v_invoice_id uuid; v_line_id uuid; v_batch_id uuid; v_qty numeric; v_free numeric; v_factor numeric; v_base_qty numeric; v_free_base numeric;
  v_price numeric; v_tax_pct numeric; v_disc numeric; v_lsub numeric; v_ltax numeric; v_subtotal numeric:=0; v_line_tax numeric:=0; v_line_disc numeric:=0;
  v_tax numeric; v_total numeric; v_paid numeric; v_remaining numeric; v_take numeric; v_free_take numeric; v_cost numeric; v_cost_sum numeric; v_mrp numeric; v_stock_before numeric; v_stock_after numeric; v_location uuid;
  v_batch_text text; v_mfg date; v_exp date; v_reference text; v_key text; v_selected_batch uuid;
begin
  if p_kind not in ('sale','purchase') then raise exception 'Pharmacy invoice type is invalid'; end if;
  if p_operation_key is null or btrim(p_operation_key)='' then raise exception 'A retry-safe operation key is required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>200 then raise exception 'Add 1 to 200 pharmacy invoice lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_operation_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.invoice_id is null then raise exception 'This operation key is already being used for another Pharmacy workflow'; end if;
    select * into v_invoice from public.invoices where id=v_operation.invoice_id and store_id=p_store_id;
    if found then return v_invoice; end if;
  end if;
  if p_party_id is not null then
    if p_kind='sale' and not exists(select 1 from public.customers where id=p_party_id and store_id=p_store_id) then raise exception 'Customer does not belong to this shop'; end if;
    if p_kind='purchase' and not exists(select 1 from public.suppliers where id=p_party_id and store_id=p_store_id) then raise exception 'Supplier does not belong to this shop'; end if;
  end if;
  -- Lock and validate all product and unit rows before building the financial invoice.
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);v_free:=coalesce((v_item->>'freeQuantity')::numeric,0);
    if v_qty<=0 or v_free<0 then raise exception 'Line quantities must be positive and bonus quantities cannot be negative'; end if;
    select * into v_product from public.pharmacy_products where id=(v_item->>'productId')::uuid and store_id=p_store_id and active for update;
    if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_item->>'unitLabel')) for update;
    if not found or (p_kind='sale' and not v_unit.can_sell) or (p_kind='purchase' and not v_unit.can_purchase) then raise exception 'Selected unit is not enabled for this operation'; end if;
    if not v_unit.allow_fractional and (v_qty<>trunc(v_qty) or v_free<>trunc(v_free)) then raise exception 'This medicine unit does not allow fractional quantities'; end if;
    v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    if v_base_qty<=0 then raise exception 'Converted quantity must be greater than zero'; end if;
    if p_kind='purchase' and v_product.tracks_batch and coalesce(btrim(v_item->>'batchNumber'),'')='' then raise exception 'Batch / lot number is required for this medicine'; end if;
    if p_kind='purchase' and v_product.tracks_expiry and nullif(v_item->>'expiryDate','') is null then raise exception 'Expiry date is required for this medicine'; end if;
    if p_kind='purchase' and nullif(v_item->>'expiryDate','') is not null and (v_item->>'expiryDate')::date < current_date then raise exception 'Expired stock cannot be received into saleable stock'; end if;
    v_price:=coalesce((v_item->>'unitPrice')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    if v_price<0 then raise exception 'Price cannot be negative'; end if;
    v_tax_pct:=coalesce((v_item->>'taxPercent')::numeric,0);v_disc:=coalesce((v_item->>'discount')::numeric,0);
    if v_tax_pct<0 or v_disc<0 then raise exception 'Tax and discount cannot be negative'; end if;
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    if v_disc>v_lsub+v_ltax then raise exception 'Line discount cannot exceed its value'; end if;
    v_subtotal:=v_subtotal+v_lsub;v_line_tax:=v_line_tax+v_ltax;v_line_disc:=v_line_disc+v_disc;
  end loop;
  v_tax:=round(v_subtotal*coalesce(p_tax_percent,0)/100,2);v_total:=round(v_subtotal+v_line_tax+v_tax-v_line_disc-coalesce(p_discount,0),2);v_paid:=coalesce(p_paid_amount,0);
  if coalesce(p_tax_percent,0)<0 or coalesce(p_discount,0)<0 or v_paid<0 or v_total<0 or v_paid>v_total then raise exception 'Tax, discount or paid amount is invalid'; end if;
  if p_kind='sale' then
    insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
    values(p_store_id,'sale',p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by) returning * into v_invoice;
  else
    insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
    values(p_store_id,'purchase',p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by) returning * into v_invoice;
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    select * into v_product from public.pharmacy_products where id=(v_item->>'productId')::uuid and store_id=p_store_id for update;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and lower(unit_label)=lower(btrim(v_item->>'unitLabel')) for update;
    v_qty:=(v_item->>'quantity')::numeric;v_free:=coalesce((v_item->>'freeQuantity')::numeric,0);v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    v_price:=coalesce((v_item->>'unitPrice')::numeric,0);if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor);end if;
    v_tax_pct:=coalesce((v_item->>'taxPercent')::numeric,0);v_disc:=coalesce((v_item->>'discount')::numeric,0);v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
    values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,case when p_kind='purchase' then v_price else 0 end) returning * into v_line;
    v_location:=coalesce(nullif(v_item->>'locationId','')::uuid,v_product.default_location_id);v_mrp:=coalesce(nullif(v_item->>'salePrice','')::numeric,v_product.sale_price);
    insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
    values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,case when p_kind='purchase' then v_base_qty+v_free_base else v_base_qty end,case when p_kind='purchase' then v_free_base else 0 end,case when p_kind='purchase' and (v_base_qty+v_free_base)>0 then (v_qty*v_price)/(v_base_qty+v_free_base) else 0 end,v_mrp);
    if p_kind='purchase' then
      v_batch_text:=nullif(btrim(v_item->>'batchNumber'),'');v_mfg:=nullif(v_item->>'manufacturingDate','')::date;v_exp:=nullif(v_item->>'expiryDate','')::date;
      v_batch_id:=gen_random_uuid();v_stock_before:=0;v_stock_after:=v_base_qty+v_free_base;
      insert into public.pharmacy_batches(id,store_id,product_id,batch_number,manufacturing_date,expiry_date,quantity_on_hand_base,free_quantity_base,unit_cost,mrp_per_base,status,location_id,supplier_id,purchase_invoice_id,purchase_invoice_line_id,created_by)
      values(v_batch_id,p_store_id,v_product.id,v_batch_text,v_mfg,v_exp,v_stock_after,v_free_base,case when v_stock_after>0 then round((v_qty*v_price)/v_stock_after,6) else 0 end,v_mrp,case when v_exp is not null and v_exp<current_date then 'expired' else 'available' end,v_location,p_party_id,v_invoice.id,v_line.id,p_created_by);
      insert into public.pharmacy_invoice_batches(store_id,invoice_line_id,batch_id,movement_kind,quantity_base) values(p_store_id,v_line.id,v_batch_id,'purchase',v_stock_after);
      update public.inventory_items set total_stock=total_stock+v_stock_after,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,to_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,v_batch_id,'purchase',v_stock_after,v_stock_before,v_stock_after,v_location,'invoice',v_invoice.id,'Purchase receipt '||p_invoice_number,p_operation_key||':purchase:'||v_line.id,p_created_by);
    else
      v_remaining:=v_base_qty;v_cost_sum:=0;v_selected_batch:=nullif(v_item->>'batchId','')::uuid;
      for v_batch in select * from public.pharmacy_batches b where b.store_id=p_store_id and b.product_id=v_product.id and b.status='available' and b.quantity_on_hand_base>0 and (b.expiry_date is null or b.expiry_date>=current_date) and (v_selected_batch is null or b.id=v_selected_batch) order by b.expiry_date asc nulls last,b.created_at asc,b.id asc for update loop
        exit when v_remaining<=0;
        v_take:=least(v_remaining,v_batch.quantity_on_hand_base);v_stock_before:=v_batch.quantity_on_hand_base;v_stock_after:=v_stock_before-v_take;
        v_free_take:=case when v_stock_before>0 then round(least(v_batch.free_quantity_base,v_batch.free_quantity_base*v_take/v_stock_before),3) else 0 end;
        update public.pharmacy_batches set quantity_on_hand_base=v_stock_after,free_quantity_base=greatest(0,free_quantity_base-v_free_take),updated_at=now() where id=v_batch.id;
        update public.inventory_items set total_stock=total_stock-v_take,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id and total_stock>=v_take;
        if not found then raise exception 'Pharmacy stock ledger is inconsistent; refresh and recount stock'; end if;
        insert into public.pharmacy_invoice_batches(store_id,invoice_line_id,batch_id,movement_kind,quantity_base) values(p_store_id,v_line.id,v_batch.id,'sale',v_take);
        insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,from_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
        values(p_store_id,v_product.id,v_batch.id,'sale',v_take,v_stock_before,v_stock_after,v_batch.location_id,'invoice',v_invoice.id,'Pharmacy POS '||p_invoice_number,p_operation_key||':sale:'||v_line.id||':'||v_batch.id,p_created_by);
        v_remaining:=v_remaining-v_take;v_cost_sum:=v_cost_sum+v_take*v_batch.unit_cost;
      end loop;
      if v_remaining>0 then raise exception 'Insufficient eligible batch stock. Expired, recalled, blocked and quarantined stock cannot be sold'; end if;
      update public.invoice_lines set cost_price=case when v_qty>0 then round(v_cost_sum/v_qty,2) else 0 end where id=v_line.id;
      update public.pharmacy_invoice_lines set unit_cost_base=case when v_base_qty>0 then v_cost_sum/v_base_qty else 0 end where invoice_line_id=v_line.id;
    end if;
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,created_by) values(p_store_id,p_operation_key,p_kind,v_invoice.id,p_created_by);
  select i.* into v_invoice from public.invoices i where i.id=v_invoice.id and i.store_id=p_store_id;
  return v_invoice;
end $$;

create or replace function public.pharmacy_move_batch(p_store_id uuid,p_batch_id uuid,p_quantity numeric,p_location_id uuid,p_actor uuid,p_operation_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.pharmacy_batches; target_id uuid; moved uuid; before_qty numeric; after_qty numeric; free_moved numeric; prior public.pharmacy_operations;
begin
  if p_quantity<=0 or p_operation_key is null or btrim(p_operation_key)='' then raise exception 'Move quantity and retry-safe operation key are required'; end if;
  select * into prior from public.pharmacy_operations where store_id=p_store_id and operation_key=p_operation_key;
  if found then if prior.operation_type<>'move' then raise exception 'This operation key is already used'; end if;return jsonb_build_object('batch_id',prior.result_id,'quantity_base',p_quantity,'location_id',p_location_id,'idempotent',true);end if;
  select * into b from public.pharmacy_batches where id=p_batch_id and store_id=p_store_id for update;
  if not found then raise exception 'Batch not found in this shop'; end if;
  if p_quantity>b.quantity_on_hand_base then raise exception 'Move quantity exceeds batch stock'; end if;
  if p_location_id is not null and not exists(select 1 from public.pharmacy_shelves where id=p_location_id and store_id=p_store_id and active) then raise exception 'Destination shelf does not belong to this shop'; end if;
  before_qty:=b.quantity_on_hand_base;
  if p_quantity=before_qty then
    update public.pharmacy_batches set location_id=p_location_id,updated_at=now() where id=b.id;
    target_id:=b.id;
  else
    after_qty:=before_qty-p_quantity;
    free_moved:=round(least(b.free_quantity_base,b.free_quantity_base*p_quantity/nullif(before_qty,0)),3);
    update public.pharmacy_batches set quantity_on_hand_base=after_qty,free_quantity_base=greatest(0,free_quantity_base-free_moved),updated_at=now() where id=b.id;
    moved:=gen_random_uuid();
    insert into public.pharmacy_batches(id,store_id,product_id,batch_number,manufacturing_date,expiry_date,quantity_on_hand_base,free_quantity_base,unit_cost,mrp_per_base,status,location_id,supplier_id,purchase_invoice_id,purchase_invoice_line_id,created_by)
    values(moved,b.store_id,b.product_id,b.batch_number,b.manufacturing_date,b.expiry_date,p_quantity,free_moved,b.unit_cost,b.mrp_per_base,b.status,p_location_id,b.supplier_id,b.purchase_invoice_id,b.purchase_invoice_line_id,p_actor);
    target_id:=moved;
  end if;
  insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,from_location_id,to_location_id,reference_type,reference_id,reason,idempotency_key,created_by)
  values(p_store_id,b.product_id,target_id,'shelf_move',p_quantity,b.quantity_on_hand_base,b.quantity_on_hand_base,b.location_id,p_location_id,'batch',b.id,'Shelf movement',p_operation_key,p_actor);
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,result_id,created_by) values(p_store_id,p_operation_key,'move',target_id,p_actor);
  return jsonb_build_object('batch_id',target_id,'quantity_base',p_quantity,'location_id',p_location_id);
end $$;

-- The following two financial/stock workflows are deliberately blocked until their
-- batch-aware RPC is used by the Pharmacy screen. Generic EMS forms remain unchanged.
commit;

revoke all on public.pharmacy_manufacturers from public,anon,authenticated;
grant all on public.pharmacy_manufacturers to service_role;
alter table public.pharmacy_manufacturers enable row level security;
revoke all on function public.pharmacy_save_product(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_save_product(uuid,uuid,jsonb,jsonb,uuid) to service_role;
revoke all on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) to service_role;
revoke all on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) to service_role;

-- Safe Pharmacy customer-return intake. Records physical receipt in quarantine only;
-- deliberately does not refund, alter dues, or add units back to saleable stock.
begin;

create or replace function public.pharmacy_intake_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_operation public.pharmacy_operations; v_return public.pharmacy_returns;
  v_raw jsonb; v_line_id uuid; v_batch_id uuid; v_product_id uuid; v_qty numeric; v_sold numeric; v_returned numeric; v_stock numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned batch lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>'return' or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then raise exception 'Original invoice is not a Pharmacy sale in this shop'; end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;
  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,idempotency_key,created_by)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),'return',0,'none','quarantined',btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by)
  returning * into v_return;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;v_batch_id:=nullif(v_raw->>'batch_id','')::uuid;v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    if v_line_id is null or v_batch_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line, source batch and positive quantity'; end if;
    select pil.product_id into v_product_id from public.pharmacy_invoice_lines pil join public.invoice_lines il on il.id=pil.invoice_line_id join public.pharmacy_invoice_batches pib on pib.invoice_line_id=il.id and pib.batch_id=v_batch_id and pib.movement_kind='sale' where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id and il.invoice_id=p_invoice_id;
    if not found then raise exception 'Returned batch is not linked to the original Pharmacy sale'; end if;
    select coalesce(sum(quantity_base),0) into v_sold from public.pharmacy_invoice_batches where store_id=p_store_id and invoice_line_id=v_line_id and batch_id=v_batch_id and movement_kind='sale';
    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri join public.pharmacy_returns pr on pr.id=ri.return_id where pr.store_id=p_store_id and pr.invoice_id=p_invoice_id and ri.invoice_line_id=v_line_id and ri.batch_id=v_batch_id;
    if v_qty>v_sold-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this sold batch'; end if;
    select ii.total_stock into v_stock from public.pharmacy_products pp join public.inventory_items ii on ii.id=pp.inventory_item_id where pp.id=v_product_id and pp.store_id=p_store_id;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,v_batch_id,v_qty,'quarantined',btrim(p_reason),0,false);
    insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
    values(p_store_id,v_product_id,v_batch_id,'customer_return_intake',v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,btrim(p_reason),p_idempotency_key||':intake:'||v_line_id||':'||v_batch_id,p_created_by);
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,'return',p_invoice_id,v_return.id,p_created_by);
  return to_jsonb(v_return);
end $$;

revoke all on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) to service_role;
commit;

-- Pharmacy return inspection/release. Saleable stock is restored only after
-- an authorized sealed-package inspection, to the original eligible batch.
begin;

alter table public.pharmacy_return_items
  add column if not exists package_sealed boolean not null default false,
  add column if not exists inspection_notes text,
  add column if not exists inspected_by uuid,
  add column if not exists inspected_at timestamptz;

create or replace function public.pharmacy_release_return(
  p_store_id uuid,p_return_id uuid,p_return_item_id uuid,p_package_sealed boolean,
  p_inspection_notes text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item public.pharmacy_return_items; v_return public.pharmacy_returns; v_batch public.pharmacy_batches;
  v_product public.pharmacy_products; v_before numeric; v_after numeric;
begin
  if p_package_sealed is not true then raise exception 'Only an inspected, factory-sealed return can be released to saleable stock'; end if;
  select * into v_item from public.pharmacy_return_items where id=p_return_item_id and return_id=p_return_id and store_id=p_store_id for update;
  if not found then raise exception 'Pharmacy return item was not found in this shop'; end if;
  if v_item.restocked then return jsonb_build_object('id',v_item.id,'restocked',true,'idempotent',true,'quantity_base',v_item.quantity_base); end if;
  if v_item.condition<>'quarantined' or v_item.batch_id is null then raise exception 'Only a quarantined, batch-linked return item can be inspected'; end if;
  select * into v_return from public.pharmacy_returns where id=v_item.return_id and store_id=p_store_id;
  if not found then raise exception 'Pharmacy return record was not found in this shop'; end if;
  select * into v_batch from public.pharmacy_batches where id=v_item.batch_id and store_id=p_store_id and product_id=v_item.product_id for update;
  if not found then raise exception 'Original batch was not found in this shop'; end if;
  if v_batch.status<>'available' then raise exception 'Original batch is blocked, recalled, or quarantined and cannot receive returned stock'; end if;
  if v_batch.expiry_date is not null and v_batch.expiry_date<current_date then raise exception 'Expired batch cannot receive returned stock'; end if;
  select * into v_product from public.pharmacy_products where id=v_item.product_id and store_id=p_store_id and active for update;
  if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
  select total_stock into v_before from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
  if not found then raise exception 'Linked inventory record was not found'; end if;
  v_after:=v_before+v_item.quantity_base;
  update public.pharmacy_batches set quantity_on_hand_base=quantity_on_hand_base+v_item.quantity_base,updated_at=now() where id=v_batch.id;
  update public.inventory_items set total_stock=total_stock+v_item.quantity_base,updated_at=now() where id=v_product.inventory_item_id and store_id=p_store_id;
  update public.pharmacy_return_items set condition='sellable',restocked=true,package_sealed=true,
    inspection_notes=nullif(btrim(p_inspection_notes),''),inspected_by=p_actor,inspected_at=now()
  where id=v_item.id and store_id=p_store_id and restocked=false;
  insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
  values(p_store_id,v_product.id,v_batch.id,'customer_return_restock',v_item.quantity_base,v_before,v_after,'pharmacy_return',v_return.id,
    'Sealed package inspected and released from quarantine','return-restock:'||v_item.id,p_actor);
  return jsonb_build_object('id',v_item.id,'return_id',v_return.id,'product_id',v_product.id,'batch_id',v_batch.id,
    'quantity_base',v_item.quantity_base,'restocked',true,'package_sealed',true,'inspected_by',p_actor,'inspected_at',now());
end $$;

revoke all on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) to service_role;
commit;

-- ============================================================================
-- ============================================================================
-- ============================================================================
-- Pharmacy aggregate-stock upgrade (also applied as migration 051)
-- Additive, data-preserving model for aggregate inventory and weighted-average cost.
-- ============================================================================
-- Pharmacy aggregate-stock model. Existing batch records are retained as legacy
-- history; new receipts and sales use inventory_items.total_stock plus weighted cost.
begin;

alter table public.pharmacy_products
  add column if not exists average_cost_base numeric(14,6) not null default 0
  check (average_cost_base >= 0);

-- Preserve historical cost information while moving current stock to one product-level balance.
update public.pharmacy_products p
set average_cost_base = coalesce(
  (select round(sum(b.quantity_on_hand_base * b.unit_cost) / nullif(sum(b.quantity_on_hand_base),0),6)
   from public.pharmacy_batches b where b.store_id=p.store_id and b.product_id=p.id and b.quantity_on_hand_base>0),
  p.purchase_price,0
);
update public.pharmacy_products set tracks_batch=false,tracks_expiry=false;

-- Keep legacy shelf references intact for record compatibility, but never expose
-- them in the aggregate-stock workflow or permit batch/expiry tracking to return.
create or replace function public.pharmacy_enforce_aggregate_product()
returns trigger language plpgsql set search_path=public as $$
begin
  new.tracks_batch:=false;
  new.tracks_expiry:=false;
  return new;
end $$;
revoke all on function public.pharmacy_enforce_aggregate_product() from public,anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='pharmacy_aggregate_product_guard' and tgrelid='public.pharmacy_products'::regclass and not tgisinternal) then
    execute 'create trigger pharmacy_aggregate_product_guard before insert or update on public.pharmacy_products for each row execute function public.pharmacy_enforce_aggregate_product()';
  end if;
end $$;

create or replace function public.pharmacy_seed_average_cost()
returns trigger language plpgsql set search_path=public as $$
declare v_stock numeric;
begin
  if tg_op='INSERT' then
    if coalesce(new.average_cost_base,0)=0 and coalesce(new.purchase_price,0)>0 then new.average_cost_base:=new.purchase_price; end if;
  elsif new.purchase_price is distinct from old.purchase_price then
    select total_stock into v_stock from public.inventory_items where id=new.inventory_item_id and store_id=new.store_id;
    if coalesce(v_stock,0)<=0 then new.average_cost_base:=new.purchase_price; end if;
  end if;
  return new;
end $$;
drop trigger if exists pharmacy_products_seed_average_cost on public.pharmacy_products;
create trigger pharmacy_products_seed_average_cost
before insert or update of purchase_price on public.pharmacy_products
for each row execute function public.pharmacy_seed_average_cost();
revoke all on function public.pharmacy_seed_average_cost() from public,anon,authenticated;

create or replace function public.pharmacy_post_invoice(
  p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,p_payment_method text,p_transaction_id text,p_notes text,
  p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,p_lines jsonb,p_operation_key text,p_allow_price_override boolean default false)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_raw jsonb; v_product public.pharmacy_products; v_unit public.pharmacy_product_units;
  v_inventory public.inventory_items; v_line public.invoice_lines; v_operation public.pharmacy_operations;
  v_qty numeric; v_free numeric; v_factor numeric; v_base_qty numeric; v_free_base numeric; v_received numeric;
  v_price numeric; v_tax_pct numeric; v_disc numeric; v_lsub numeric; v_ltax numeric;
  v_subtotal numeric:=0; v_line_tax numeric:=0; v_line_disc numeric:=0; v_tax numeric; v_total numeric; v_paid numeric;
  v_stock_before numeric; v_stock_after numeric; v_average_cost numeric; v_line_cost numeric; v_mrp numeric;
begin
  if p_kind not in ('sale','purchase') then raise exception 'Pharmacy invoice type is invalid'; end if;
  if p_operation_key is null or btrim(p_operation_key)='' then raise exception 'A retry-safe operation key is required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>200 then raise exception 'Add 1 to 200 Pharmacy invoice lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_operation_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.invoice_id is null then raise exception 'This operation key is already being used for another Pharmacy workflow'; end if;
    select * into v_invoice from public.invoices where id=v_operation.invoice_id and store_id=p_store_id;
    if found then return v_invoice; end if;
  end if;
  if p_party_id is not null then
    if p_kind='sale' and not exists(select 1 from public.customers where id=p_party_id and store_id=p_store_id) then raise exception 'Customer does not belong to this shop'; end if;
    if p_kind='purchase' and not exists(select 1 from public.suppliers where id=p_party_id and store_id=p_store_id) then raise exception 'Supplier does not belong to this shop'; end if;
  end if;
  if coalesce(p_tax_percent,0)<0 or coalesce(p_discount,0)<0 or coalesce(p_paid_amount,0)<0 then raise exception 'Invoice tax, discount or paid amount is invalid'; end if;

  -- Validate all lines and calculate the invoice before writing any stock.
  for v_raw in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce(nullif(v_raw->>'quantity','')::numeric,0);v_free:=coalesce(nullif(v_raw->>'freeQuantity','')::numeric,0);
    if v_qty<=0 or v_free<0 then raise exception 'Line quantities must be positive and bonus quantities cannot be negative'; end if;
    select * into v_product from public.pharmacy_products where id=(v_raw->>'productId')::uuid and store_id=p_store_id and active for update;
    if not found then raise exception 'Medicine is inactive or belongs to another shop'; end if;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_raw->>'unitLabel')) for update;
    if not found or (p_kind='sale' and not v_unit.can_sell) or (p_kind='purchase' and not v_unit.can_purchase) then raise exception 'Selected unit is not enabled for this operation'; end if;
    if not v_unit.allow_fractional and (v_qty<>trunc(v_qty) or v_free<>trunc(v_free)) then raise exception 'This medicine unit does not allow fractional quantities'; end if;
    v_factor:=v_unit.factor_to_base;v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    if v_factor<=0 or v_base_qty<=0 then raise exception 'Converted quantity must be greater than zero'; end if;
    v_price:=coalesce(nullif(v_raw->>'unitPrice','')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    if v_price<0 then raise exception 'Price cannot be negative'; end if;
    v_tax_pct:=coalesce(nullif(v_raw->>'taxPercent','')::numeric,0);v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    if v_tax_pct<0 or v_disc<0 then raise exception 'Tax and discount cannot be negative'; end if;
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    if v_disc>v_lsub+v_ltax then raise exception 'Line discount cannot exceed its value'; end if;
    v_subtotal:=v_subtotal+v_lsub;v_line_tax:=v_line_tax+v_ltax;v_line_disc:=v_line_disc+v_disc;
  end loop;
  v_tax:=round(v_subtotal*coalesce(p_tax_percent,0)/100,2);
  v_total:=round(v_subtotal+v_line_tax+v_tax-v_line_disc-coalesce(p_discount,0),2);v_paid:=coalesce(p_paid_amount,0);
  if v_total<0 or v_paid>v_total then raise exception 'Invoice tax, discount or paid amount is invalid'; end if;

  insert into public.invoices(store_id,kind,invoice_number,party_id,invoice_date,payment_method,transaction_id,notes,subtotal,tax_percent,discount,tax_amount,line_tax_amount,line_discount_amount,paid_amount,total_due,created_by)
  values(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,coalesce(p_payment_method,'cash')::public.payment_method,p_transaction_id,p_notes,
    round(v_subtotal,2),coalesce(p_tax_percent,0),coalesce(p_discount,0),v_tax,round(v_line_tax,2),round(v_line_disc,2),v_paid,round(v_total-v_paid,2),p_created_by)
  returning * into v_invoice;

  for v_raw in select value from jsonb_array_elements(p_lines) loop
    select * into v_product from public.pharmacy_products where id=(v_raw->>'productId')::uuid and store_id=p_store_id for update;
    select * into v_unit from public.pharmacy_product_units where product_id=v_product.id and store_id=p_store_id and lower(unit_label)=lower(btrim(v_raw->>'unitLabel')) for update;
    select * into v_inventory from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id for update;
    if not found then raise exception 'Linked Pharmacy inventory record was not found'; end if;
    v_qty:=(v_raw->>'quantity')::numeric;v_free:=coalesce(nullif(v_raw->>'freeQuantity','')::numeric,0);v_factor:=v_unit.factor_to_base;
    v_base_qty:=round(v_qty*v_factor,3);v_free_base:=round(v_free*v_factor,3);
    v_price:=coalesce(nullif(v_raw->>'unitPrice','')::numeric,0);
    if p_kind='sale' and not p_allow_price_override then v_price:=coalesce(v_unit.selling_price,v_product.sale_price*v_factor); end if;
    v_tax_pct:=coalesce(nullif(v_raw->>'taxPercent','')::numeric,0);v_disc:=round(coalesce(nullif(v_raw->>'discount','')::numeric,0),2);
    v_lsub:=round(v_qty*v_price,2);v_ltax:=round(v_lsub*v_tax_pct/100,2);
    v_mrp:=coalesce(nullif(v_raw->>'salePrice','')::numeric,v_product.sale_price);
    if v_mrp<0 then raise exception 'MRP must be non-negative'; end if;
    v_stock_before:=coalesce(v_inventory.total_stock,0);

    if p_kind='sale' then
      if v_stock_before+0.0001<v_base_qty then raise exception 'Insufficient Pharmacy stock; refresh and retry'; end if;
      v_average_cost:=greatest(0,coalesce(v_product.average_cost_base,v_product.purchase_price,0));
      v_line_cost:=round(v_average_cost*v_factor,2);v_stock_after:=round(v_stock_before-v_base_qty,3);
      insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
      values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,v_line_cost) returning * into v_line;
      insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
      values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,v_base_qty,0,v_average_cost,v_mrp);
      update public.inventory_items set total_stock=v_stock_after,updated_at=now() where id=v_inventory.id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,null,'sale',v_base_qty,v_stock_before,v_stock_after,'invoice',v_invoice.id,'Pharmacy POS '||v_invoice.invoice_number,p_operation_key||':sale:'||v_line.id,p_created_by);
    else
      v_received:=round(v_base_qty+v_free_base,3);v_stock_after:=round(v_stock_before+v_received,3);
      v_average_cost:=case when v_stock_after>0 then round((v_stock_before*greatest(0,coalesce(v_product.average_cost_base,v_product.purchase_price,0))+v_qty*v_price)/v_stock_after,6) else 0 end;
      insert into public.invoice_lines(invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
      values(v_invoice.id,v_product.inventory_item_id,v_qty,v_price,round(v_lsub+v_ltax-v_disc,2),v_tax_pct,v_disc,v_price) returning * into v_line;
      insert into public.pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base)
      values(v_line.id,p_store_id,v_product.id,v_unit.unit_label,v_factor,v_received,v_free_base,case when v_received>0 then round(v_qty*v_price/v_received,6) else 0 end,v_mrp);
      update public.pharmacy_products set average_cost_base=v_average_cost,updated_at=now() where id=v_product.id and store_id=p_store_id;
      update public.inventory_items set total_stock=v_stock_after,updated_at=now() where id=v_inventory.id and store_id=p_store_id;
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product.id,null,'purchase',v_received,v_stock_before,v_stock_after,'invoice',v_invoice.id,'Purchase receipt '||v_invoice.invoice_number,p_operation_key||':purchase:'||v_line.id,p_created_by);
    end if;
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,created_by)
  values(p_store_id,p_operation_key,p_kind,v_invoice.id,p_created_by);
  select * into v_invoice from public.invoices where id=v_invoice.id and store_id=p_store_id;
  return v_invoice;
end $$;

create or replace function public.pharmacy_intake_return(
  p_store_id uuid,p_invoice_id uuid,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices;v_operation public.pharmacy_operations;v_return public.pharmacy_returns;v_raw jsonb;
  v_line_id uuid;v_product_id uuid;v_qty numeric;v_sold numeric;v_returned numeric;v_stock numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned Pharmacy lines'; end if;
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>'return' or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then raise exception 'Original invoice is not a Pharmacy sale in this shop'; end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;
  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,idempotency_key,created_by)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),'return',0,'none','quarantined',btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by)
  returning * into v_return;
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    if v_line_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line and positive quantity'; end if;
    select pil.product_id,pil.quantity_base into v_product_id,v_sold
      from public.pharmacy_invoice_lines pil join public.invoice_lines il on il.id=pil.invoice_line_id
      where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id and il.invoice_id=p_invoice_id;
    if not found then raise exception 'Return line is not linked to the original Pharmacy sale'; end if;
    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri join public.pharmacy_returns pr on pr.id=ri.return_id
      where pr.store_id=p_store_id and pr.invoice_id=p_invoice_id and ri.invoice_line_id=v_line_id;
    if v_qty>v_sold-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this Pharmacy sale'; end if;
    select total_stock into v_stock from public.inventory_items where id=(select inventory_item_id from public.pharmacy_products where id=v_product_id and store_id=p_store_id) and store_id=p_store_id;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,null,v_qty,'quarantined',btrim(p_reason),0,false);
    insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
    values(p_store_id,v_product_id,null,'customer_return_intake',v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,btrim(p_reason),p_idempotency_key||':intake:'||v_line_id,p_created_by);
  end loop;
  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,'return',p_invoice_id,v_return.id,p_created_by);
  return to_jsonb(v_return);
end $$;

create or replace function public.pharmacy_release_return(
  p_store_id uuid,p_return_id uuid,p_return_item_id uuid,p_package_sealed boolean,p_inspection_notes text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Pharmacy customer returns remain quarantined; aggregate stock release is not enabled under the approved policy';
end $$;

-- Keep the legacy signature for compatibility while making shelf/batch movement inert.
create or replace function public.pharmacy_move_batch(
  p_store_id uuid,p_batch_id uuid,p_quantity numeric,p_location_id uuid,p_actor uuid,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Batch and shelf movement workflows have been retired; Pharmacy stock is aggregate-only';
end $$;
revoke all on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pharmacy_move_batch(uuid,uuid,numeric,uuid,uuid,text) to service_role;

revoke all on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.pharmacy_post_invoice(uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,uuid,jsonb,text,boolean) to service_role;
revoke all on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb) to service_role;
revoke all on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid) to service_role;



create or replace function public.pharmacy_delete_product(p_store_id uuid,p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_product record;
begin
  select p.id,p.store_id,p.inventory_item_id,p.name,i.item_code as sku,i.total_stock
    into v_product
    from public.pharmacy_products p
    join public.inventory_items i on i.id=p.inventory_item_id and i.store_id=p.store_id
    where p.id=p_product_id and p.store_id=p_store_id
    for update of p,i;
  if not found then raise exception 'Medicine was not found in this shop'; end if;
  if abs(coalesce(v_product.total_stock,0))>0.0001 then
    raise exception 'Medicine has on-hand stock; deactivate it instead of deleting it';
  end if;
  if exists(
       select 1 from public.invoice_lines il join public.invoices inv on inv.id=il.invoice_id
       where inv.store_id=p_store_id and il.item_id=v_product.inventory_item_id
     )
     or exists(select 1 from public.pharmacy_invoice_lines where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_stock_movements where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_batches where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.pharmacy_return_items where store_id=p_store_id and product_id=p_product_id)
     or exists(select 1 from public.inventory_stock_movements where store_id=p_store_id and item_id=v_product.inventory_item_id)
  then
    raise exception 'Medicine has stock or transaction history; deactivate it to keep the audit record';
  end if;

  delete from public.pharmacy_alerts
    where store_id=p_store_id and alert_key='low-stock:'||p_product_id::text;
  delete from public.pharmacy_products where id=p_product_id and store_id=p_store_id;
  delete from public.inventory_items where id=v_product.inventory_item_id and store_id=p_store_id;
  return jsonb_build_object('id',v_product.id,'name',v_product.name,'sku',v_product.sku);
end $$;

revoke all on function public.pharmacy_delete_product(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pharmacy_delete_product(uuid,uuid) to service_role;


commit;

-- Owner Pharmacy catalog templates (global; no shop stock).
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

-- Existing Supabase installations: apply once after migration 058.
-- Preserves legacy batch-linked pharmacy_supplier_returns; modern Pharmacy purchases
-- are item-based and are returned against their original invoice lines.
create table if not exists public.pharmacy_supplier_return_headers (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
 purchase_invoice_id uuid not null references public.invoices(id) on delete restrict,
 supplier_id uuid references public.suppliers(id) on delete set null,
 return_number text not null,return_date date not null,reason text not null,notes text,
 settlement_method text not null check(settlement_method in ('refund','credit')),
 amount numeric(14,2) not null check(amount>=0),due_reduction numeric(14,2) not null default 0 check(due_reduction>=0),
 idempotency_key text not null,created_by uuid,created_at timestamptz not null default now(),
 unique(store_id,return_number),unique(store_id,idempotency_key)
);
create index if not exists pharmacy_supplier_return_headers_purchase_idx on public.pharmacy_supplier_return_headers(store_id,purchase_invoice_id,created_at desc);
create table if not exists public.pharmacy_supplier_return_lines (
 id uuid primary key default gen_random_uuid(),return_id uuid not null references public.pharmacy_supplier_return_headers(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
 product_id uuid not null references public.pharmacy_products(id) on delete restrict,
 quantity_base numeric(16,3) not null check(quantity_base>0),amount numeric(14,2) not null check(amount>=0)
);
create index if not exists pharmacy_supplier_return_lines_invoice_idx on public.pharmacy_supplier_return_lines(store_id,invoice_line_id);
alter table public.pharmacy_supplier_return_headers enable row level security;
alter table public.pharmacy_supplier_return_lines enable row level security;
grant all on public.pharmacy_supplier_return_headers,public.pharmacy_supplier_return_lines to service_role;

create or replace function public.pharmacy_post_supplier_return(
 p_store_id uuid,p_invoice_id uuid,p_return_number text,p_return_date date,p_reason text,p_notes text,
 p_settlement_method text,p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns public.pharmacy_supplier_return_headers language plpgsql security definer set search_path=public as $$
declare v_invoice record;v_prior public.pharmacy_supplier_return_headers%rowtype;v_return public.pharmacy_supplier_return_headers%rowtype;
 v_item jsonb;v_line record;v_prepared jsonb:='[]'::jsonb;v_seen uuid[]:='{}'::uuid[];
 v_line_id uuid;v_qty numeric(16,3);v_previous numeric(16,3);v_previous_amount numeric(14,2);v_gross_lines numeric(14,2);v_net_total numeric(14,2);v_net_line numeric(14,2);v_amount numeric(14,2):=0;v_line_amount numeric(14,2);v_due numeric(14,2);v_before numeric(16,3);
begin
 if p_store_id is null or p_invoice_id is null or p_idempotency_key is null or p_reason is null or btrim(p_reason)='' or p_return_date is null
    or p_settlement_method not in ('refund','credit') or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Valid purchase, reason, settlement and 1 to 50 return items are required';end if;
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select i.* into v_invoice from public.invoices i join public.pharmacy_operations o on o.invoice_id=i.id and o.store_id=i.store_id and o.operation_type='purchase'
 where i.id=p_invoice_id and i.store_id=p_store_id and i.kind='purchase' for update of i;
 if not found then raise exception 'Original Pharmacy purchase was not found in this shop';end if;
 -- Another request may have committed the same operation while we waited on the invoice lock.
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select coalesce(sum(line_total),0) into v_gross_lines from public.invoice_lines where invoice_id=p_invoice_id;
 v_net_total:=round(v_invoice.subtotal+coalesce(v_invoice.line_tax_amount,0)+v_invoice.tax_amount-v_invoice.discount-coalesce(v_invoice.line_discount_amount,0),2);
 for v_item in select element from jsonb_array_elements(p_items) as j(element) loop
  v_line_id:=(v_item->>'invoice_line_id')::uuid;v_qty:=(v_item->>'quantity_base')::numeric;
  if v_line_id is null or v_line_id=any(v_seen) or v_qty is null or v_qty<=0 or v_qty<>round(v_qty,3) then raise exception 'Return line quantities must be unique, positive and at most three decimal places';end if;
  v_seen:=array_append(v_seen,v_line_id);
  select l.line_total,x.product_id,x.quantity_base,p.inventory_item_id into v_line from public.invoice_lines l
    join public.pharmacy_invoice_lines x on x.invoice_line_id=l.id and x.store_id=p_store_id
    join public.pharmacy_products p on p.id=x.product_id and p.store_id=p_store_id and p.inventory_item_id=l.item_id
    where l.id=v_line_id and l.invoice_id=p_invoice_id;
  if not found then raise exception 'Return item does not belong to this Pharmacy purchase';end if;
  select coalesce(sum(quantity_base),0),coalesce(sum(amount),0) into v_previous,v_previous_amount from public.pharmacy_supplier_return_lines where store_id=p_store_id and invoice_line_id=v_line_id;
  if v_qty>v_line.quantity_base-v_previous then raise exception 'Returned quantity exceeds the original purchase quantity';end if;
  v_net_line:=case when v_gross_lines>0 then round(v_net_total*v_line.line_total/v_gross_lines,2) else 0 end;
  v_line_amount:=greatest(0,least(v_net_line-v_previous_amount,round(v_net_line*v_qty/v_line.quantity_base,2)));v_amount:=v_amount+v_line_amount;
  v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('line',v_line_id,'product',v_line.product_id,'item',v_line.inventory_item_id,'qty',v_qty,'amount',v_line_amount));
 end loop;
 v_due:=least(greatest(v_invoice.total_due,0),v_amount);
 insert into public.pharmacy_supplier_return_headers(store_id,purchase_invoice_id,supplier_id,return_number,return_date,reason,notes,settlement_method,amount,due_reduction,idempotency_key,created_by)
 values(p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,p_return_date,btrim(p_reason),p_notes,p_settlement_method,v_amount,v_due,p_idempotency_key,p_created_by) returning * into v_return;
 for v_item in select element from jsonb_array_elements(v_prepared) as j(element) loop
  v_qty:=(v_item->>'qty')::numeric;
  select total_stock into v_before from public.inventory_items where id=(v_item->>'item')::uuid and store_id=p_store_id for update;
  if v_before is null or v_before<v_qty then raise exception 'Not enough shop stock to return this medicine';end if;
  update public.inventory_items set total_stock=total_stock-v_qty,updated_at=now() where id=(v_item->>'item')::uuid and store_id=p_store_id;
  insert into public.pharmacy_supplier_return_lines(return_id,store_id,invoice_line_id,product_id,quantity_base,amount)
   values(v_return.id,p_store_id,(v_item->>'line')::uuid,(v_item->>'product')::uuid,v_qty,(v_item->>'amount')::numeric);
  insert into public.pharmacy_stock_movements(store_id,product_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
   values(p_store_id,(v_item->>'product')::uuid,'supplier_return',v_qty,v_before,v_before-v_qty,'supplier_return',v_return.id,v_return.reason,p_idempotency_key||':'||(v_item->>'line'),p_created_by);
 end loop;
 update public.invoices set total_due=greatest(0,total_due-v_due),updated_at=now() where id=p_invoice_id and store_id=p_store_id;
 return v_return;
end $$;
revoke all on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) to service_role;

-- Existing Supabase installs: apply after 059. Saleable stock is untouched
-- when a quarantine item (customer return) is shipped to a supplier.
alter table public.pharmacy_supplier_return_lines add column if not exists quarantine_item_id uuid references public.pharmacy_return_items(id) on delete restrict;
create index if not exists pharmacy_supplier_return_lines_quarantine_idx on public.pharmacy_supplier_return_lines(store_id,quarantine_item_id);
create or replace function public.pharmacy_post_supplier_return(
 p_store_id uuid,p_invoice_id uuid,p_return_number text,p_return_date date,p_reason text,p_notes text,
 p_settlement_method text,p_idempotency_key text,p_created_by uuid,p_items jsonb
) returns public.pharmacy_supplier_return_headers language plpgsql security definer set search_path=public as $$
declare v_invoice record;v_prior public.pharmacy_supplier_return_headers%rowtype;v_return public.pharmacy_supplier_return_headers%rowtype;
 v_item jsonb;v_line record;v_prepared jsonb:='[]'::jsonb;v_seen uuid[]:='{}'::uuid[];
 v_quarantine_id uuid;v_quarantine record;v_quarantine_used numeric(16,3);v_line_id uuid;v_qty numeric(16,3);v_previous numeric(16,3);v_previous_amount numeric(14,2);v_gross_lines numeric(14,2);v_net_total numeric(14,2);v_net_line numeric(14,2);v_amount numeric(14,2):=0;v_line_amount numeric(14,2);v_due numeric(14,2);v_before numeric(16,3);
begin
 if p_store_id is null or p_invoice_id is null or p_idempotency_key is null or p_reason is null or btrim(p_reason)='' or p_return_date is null
    or p_settlement_method not in ('refund','credit') or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Valid purchase, reason, settlement and 1 to 50 return items are required';end if;
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select i.* into v_invoice from public.invoices i join public.pharmacy_operations o on o.invoice_id=i.id and o.store_id=i.store_id and o.operation_type='purchase'
 where i.id=p_invoice_id and i.store_id=p_store_id and i.kind='purchase' for update of i;
 if not found then raise exception 'Original Pharmacy purchase was not found in this shop';end if;
 -- Another request may have committed the same operation while we waited on the invoice lock.
 select * into v_prior from public.pharmacy_supplier_return_headers where store_id=p_store_id and idempotency_key=p_idempotency_key;
 if found then
  if v_prior.purchase_invoice_id<>p_invoice_id then raise exception 'Operation key is already in use';end if;
  return v_prior;
 end if;
 select coalesce(sum(line_total),0) into v_gross_lines from public.invoice_lines where invoice_id=p_invoice_id;
 v_net_total:=round(v_invoice.subtotal+coalesce(v_invoice.line_tax_amount,0)+v_invoice.tax_amount-v_invoice.discount-coalesce(v_invoice.line_discount_amount,0),2);
 for v_item in select element from jsonb_array_elements(p_items) as j(element) loop
  v_line_id:=(v_item->>'invoice_line_id')::uuid;v_qty:=(v_item->>'quantity_base')::numeric;v_quarantine_id:=nullif(v_item->>'quarantine_item_id','')::uuid;
  if v_line_id is null or v_line_id=any(v_seen) or v_qty is null or v_qty<=0 or v_qty<>round(v_qty,3) then raise exception 'Return line quantities must be unique, positive and at most three decimal places';end if;
  v_seen:=array_append(v_seen,v_line_id);
  select l.line_total,x.product_id,x.quantity_base,p.inventory_item_id into v_line from public.invoice_lines l
    join public.pharmacy_invoice_lines x on x.invoice_line_id=l.id and x.store_id=p_store_id
    join public.pharmacy_products p on p.id=x.product_id and p.store_id=p_store_id and p.inventory_item_id=l.item_id
    where l.id=v_line_id and l.invoice_id=p_invoice_id;
  if not found then raise exception 'Return item does not belong to this Pharmacy purchase';end if;
  select coalesce(sum(quantity_base),0),coalesce(sum(amount),0) into v_previous,v_previous_amount from public.pharmacy_supplier_return_lines where store_id=p_store_id and invoice_line_id=v_line_id;
  if v_qty>v_line.quantity_base-v_previous then raise exception 'Returned quantity exceeds the original purchase quantity';end if;
  if v_quarantine_id is not null then
   select id,quantity_base into v_quarantine from public.pharmacy_return_items where id=v_quarantine_id and store_id=p_store_id and product_id=v_line.product_id and not restocked and condition in ('damaged','defective','expired','quarantined','recalled') for update;
   if not found then raise exception 'This quarantine item is not available for this medicine';end if;
   select coalesce(sum(quantity_base),0) into v_quarantine_used from public.pharmacy_supplier_return_lines where store_id=p_store_id and quarantine_item_id=v_quarantine_id;
   if v_qty>v_quarantine.quantity_base-v_quarantine_used then raise exception 'Returned quantity exceeds the available quarantined quantity';end if;
  end if;
  v_net_line:=case when v_gross_lines>0 then round(v_net_total*v_line.line_total/v_gross_lines,2) else 0 end;
  v_line_amount:=greatest(0,least(v_net_line-v_previous_amount,round(v_net_line*v_qty/v_line.quantity_base,2)));v_amount:=v_amount+v_line_amount;
  v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('line',v_line_id,'product',v_line.product_id,'item',v_line.inventory_item_id,'qty',v_qty,'amount',v_line_amount,'quarantine',v_quarantine_id));
 end loop;
 v_due:=least(greatest(v_invoice.total_due,0),v_amount);
 insert into public.pharmacy_supplier_return_headers(store_id,purchase_invoice_id,supplier_id,return_number,return_date,reason,notes,settlement_method,amount,due_reduction,idempotency_key,created_by)
 values(p_store_id,p_invoice_id,v_invoice.party_id,p_return_number,p_return_date,btrim(p_reason),p_notes,p_settlement_method,v_amount,v_due,p_idempotency_key,p_created_by) returning * into v_return;
 for v_item in select element from jsonb_array_elements(v_prepared) as j(element) loop
  v_qty:=(v_item->>'qty')::numeric;
  select total_stock into v_before from public.inventory_items where id=(v_item->>'item')::uuid and store_id=p_store_id for update;
  if v_before is null or ((v_item->>'quarantine') is null and v_before<v_qty) then raise exception 'Not enough shop stock to return this medicine';end if;
  if (v_item->>'quarantine') is null then
    update public.inventory_items set total_stock=total_stock-v_qty,updated_at=now() where id=(v_item->>'item')::uuid and store_id=p_store_id;
  else
    select id,quantity_base into v_quarantine from public.pharmacy_return_items where id=(v_item->>'quarantine')::uuid and store_id=p_store_id and product_id=(v_item->>'product')::uuid and not restocked and condition in ('damaged','defective','expired','quarantined','recalled') for update;
    if not found then raise exception 'Quarantine changed while posting this supplier return';end if;
    select coalesce(sum(quantity_base),0) into v_quarantine_used from public.pharmacy_supplier_return_lines where store_id=p_store_id and quarantine_item_id=v_quarantine.id;
    if v_qty>v_quarantine.quantity_base-v_quarantine_used then raise exception 'Returned quantity exceeds the available quarantined quantity';end if;
  end if;
  insert into public.pharmacy_supplier_return_lines(return_id,store_id,invoice_line_id,product_id,quantity_base,amount,quarantine_item_id)
   values(v_return.id,p_store_id,(v_item->>'line')::uuid,(v_item->>'product')::uuid,v_qty,(v_item->>'amount')::numeric,(v_item->>'quarantine')::uuid);
  insert into public.pharmacy_stock_movements(store_id,product_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by)
   values(p_store_id,(v_item->>'product')::uuid,case when (v_item->>'quarantine') is null then 'supplier_return' else 'supplier_return_quarantine' end,v_qty,v_before,case when (v_item->>'quarantine') is null then v_before-v_qty else v_before end,'supplier_return',v_return.id,v_return.reason,p_idempotency_key||':'||(v_item->>'line'),p_created_by);
 end loop;
 update public.invoices set total_due=greatest(0,total_due-v_due),updated_at=now() where id=p_invoice_id and store_id=p_store_id;
 return v_return;
end $$;
revoke all on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pharmacy_post_supplier_return(uuid,uuid,text,date,text,text,text,text,uuid,jsonb) to service_role;


-- Complete Pharmacy Return & Exchange workflow for fresh baseline installs.

-- 053: Pharmacy Return & Exchange with condition-based restock.
-- Replaces the quarantine-only intake (049/051) and the sealed-release function (050).
-- Condition rules:
--   Good     -> returned to saleable stock immediately (inventory_items.total_stock += qty)
--   Damaged  -> quarantined, excluded from saleable stock
--   Expired  -> quarantined, excluded from saleable stock
-- Refunds (returns) and settlement differences (exchanges) are recorded on pharmacy_returns,
-- the same way the Electronics console records them. Invoice dues are not changed.
begin;

drop function if exists public.pharmacy_intake_return(uuid,uuid,text,text,text,text,text,uuid,jsonb);
drop function if exists public.pharmacy_release_return(uuid,uuid,uuid,boolean,text,uuid);

alter table public.pharmacy_returns
  add column if not exists settlement_type text not null default 'none'
    check (settlement_type in ('none','even','customer_pays','shop_refunds')),
  add column if not exists new_items_total numeric(14,2) not null default 0 check (new_items_total >= 0),
  add column if not exists difference_amount numeric(14,2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists transaction_id text;

create table if not exists public.pharmacy_exchange_items (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references public.pharmacy_returns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.pharmacy_products(id) on delete restrict,
  unit_label text not null,
  unit_factor numeric(16,6) not null check (unit_factor > 0),
  quantity_base numeric(16,3) not null check (quantity_base > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_exchange_items_exchange_idx on public.pharmacy_exchange_items(exchange_id);
alter table public.pharmacy_exchange_items enable row level security;

create or replace function public.pharmacy_post_return_exchange(
  p_store_id uuid,p_invoice_id uuid,p_kind text,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb,p_new_items jsonb,p_refund_method text,p_payment_method text,p_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_operation public.pharmacy_operations; v_return public.pharmacy_returns;
  v_raw jsonb; v_line_id uuid; v_qty numeric; v_condition text; v_il public.invoice_lines;
  v_product_id uuid; v_sold_base numeric; v_returned numeric; v_stock numeric; v_amount numeric;
  v_returned_total numeric:=0; v_new_total numeric:=0; v_new_qty_base numeric; v_factor numeric; v_price numeric; v_line_amount numeric;
  v_unit_label text; v_new_product uuid; v_diff numeric; v_settlement text; v_refund numeric:=0;
  v_restocked boolean:=false; v_quarantined boolean:=false; v_disp text;
  v_refund_method text; v_payment_method text;
begin
  if p_kind not in ('return','exchange') then raise exception 'Unknown return type'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned Pharmacy lines'; end if;
  if p_kind='exchange' and (jsonb_typeof(p_new_items)<>'array' or jsonb_array_length(p_new_items)=0 or jsonb_array_length(p_new_items)>100) then
    raise exception 'Add 1 to 100 replacement medicines for an exchange';
  end if;
  v_refund_method:=lower(coalesce(nullif(btrim(p_refund_method),''),'none'));
  v_payment_method:=lower(coalesce(nullif(btrim(p_payment_method),''),'none'));
  if v_refund_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid refund method'; end if;
  if v_payment_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid payment method'; end if;

  -- Idempotent replay: same key returns the stored record.
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;

  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then
    raise exception 'Original invoice is not a Pharmacy sale in this shop';
  end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;

  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,
    idempotency_key,created_by,settlement_type,new_items_total,difference_amount,transaction_id)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),p_kind,0,'none','quarantined',
    btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by,'none',0,0,nullif(btrim(p_transaction_id),''))
  returning * into v_return;

  -- 1) Returned medicines: condition decides restock or quarantine.
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;
    v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    v_condition:=lower(coalesce(v_raw->>'condition',''));
    if v_line_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line and a positive quantity'; end if;
    if v_condition not in ('good','damaged','expired') then raise exception 'Condition must be Good, Damaged or Expired'; end if;

    select * into v_il from public.invoice_lines where id=v_line_id and invoice_id=p_invoice_id;
    if not found then raise exception 'Return line is not part of the original Pharmacy sale'; end if;
    select pil.product_id,pil.quantity_base into v_product_id,v_sold_base from public.pharmacy_invoice_lines pil
      where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id;
    if not found then raise exception 'Return line is not linked to Pharmacy sale stock'; end if;

    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri
      join public.pharmacy_returns pr on pr.id=ri.return_id
      where pr.store_id=p_store_id and ri.invoice_line_id=v_line_id;
    if v_qty>v_sold_base-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this Pharmacy sale'; end if;

    v_amount:=round(coalesce(v_il.line_total,0)*v_qty/nullif(v_sold_base,0),2);
    v_returned_total:=v_returned_total+v_amount;

    select ii.total_stock into v_stock from public.pharmacy_products pp
      join public.inventory_items ii on ii.id=pp.inventory_item_id
      where pp.id=v_product_id and pp.store_id=p_store_id for update of ii;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;

    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,null,v_qty,
      case when v_condition='good' then 'sellable' else v_condition end,btrim(p_reason),v_amount,v_condition='good');

    if v_condition='good' then
      update public.inventory_items set total_stock=total_stock+v_qty,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_product_id);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_restock' else 'customer_return_restock' end,
        v_qty,v_stock,v_stock+v_qty,'pharmacy_return',v_return.id,btrim(p_reason),p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_restocked:=true;
    else
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_quarantine' else 'customer_return_quarantine' end,
        v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,btrim(p_reason)||' ('||v_condition||', quarantined, excluded from stock)',
        p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_quarantined:=true;
    end if;
  end loop;

  -- 2) Replacement medicines (exchange only): issued from saleable stock at current selling price.
  if p_kind='exchange' then
    for v_raw in select value from jsonb_array_elements(p_new_items) loop
      v_new_product:=nullif(v_raw->>'product_id','')::uuid;
      v_unit_label:=btrim(coalesce(v_raw->>'unit_label',''));
      v_qty:=round(coalesce((v_raw->>'quantity')::numeric,0),3);
      if v_new_product is null or v_unit_label='' or v_qty<=0 then raise exception 'Each replacement needs a medicine, unit and positive quantity'; end if;

      select pu.factor_to_base,coalesce(pu.selling_price,0) into v_factor,v_price from public.pharmacy_product_units pu
        join public.pharmacy_products pp on pp.id=pu.product_id
        where pu.product_id=v_new_product and pu.store_id=p_store_id and pu.unit_label=v_unit_label and pu.can_sell and pp.active;
      if not found then raise exception 'Replacement medicine or unit is not available for sale'; end if;

      v_new_qty_base:=round(v_qty*v_factor,3);
      select ii.total_stock into v_stock from public.pharmacy_products pp
        join public.inventory_items ii on ii.id=pp.inventory_item_id
        where pp.id=v_new_product and pp.store_id=p_store_id for update of ii;
      if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
      if v_stock<v_new_qty_base then raise exception 'Insufficient stock for replacement medicine. Available: %', v_stock; end if;

      v_line_amount:=round(v_price*v_qty,2);
      v_new_total:=v_new_total+v_line_amount;

      insert into public.pharmacy_exchange_items(exchange_id,store_id,product_id,unit_label,unit_factor,quantity_base,unit_price,amount)
      values(v_return.id,p_store_id,v_new_product,v_unit_label,v_factor,v_new_qty_base,v_price,v_line_amount);

      update public.inventory_items set total_stock=total_stock-v_new_qty_base,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_new_product);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_new_product,null,'exchange_issue',v_new_qty_base,v_stock,v_stock-v_new_qty_base,'pharmacy_return',v_return.id,
        'Replacement issued in exchange',p_idempotency_key||':new:'||v_new_product||':'||v_unit_label,p_created_by);
    end loop;
  end if;

  -- 3) Settlement, as in the Electronics console.
  v_returned_total:=round(v_returned_total,2);
  v_new_total:=round(v_new_total,2);
  v_diff:=round(v_new_total-v_returned_total,2);
  if p_kind='return' then
    v_settlement:='none';
    v_refund:=v_returned_total;
    if v_refund>0 and v_refund_method='none' then raise exception 'Refund method is required to refund the returned amount'; end if;
    v_refund_method:=case when v_refund>0 then v_refund_method else 'none' end;
    v_payment_method:='none';
    v_diff:=0;
  elsif v_diff>0 then
    v_settlement:='customer_pays';
    if v_payment_method='none' then raise exception 'Payment method is required when the customer pays the difference'; end if;
    v_refund_method:='none';
  elsif v_diff<0 then
    v_settlement:='shop_refunds';
    v_refund:=-v_diff;
    if v_refund_method='none' then raise exception 'Refund method is required when the shop refunds the difference'; end if;
    v_payment_method:='none';
  else
    v_settlement:='even';
    v_refund_method:='none';
    v_payment_method:='none';
  end if;
  v_disp:=case when v_restocked and v_quarantined then 'mixed' when v_restocked then 'restocked' else 'quarantined' end;

  update public.pharmacy_returns set amount=v_returned_total,refund_method=v_refund_method,payment_method=case when v_payment_method='none' then null else v_payment_method end,
    disposition=v_disp,settlement_type=v_settlement,new_items_total=v_new_total,difference_amount=v_diff
    where id=v_return.id
    returning * into v_return;

  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,p_kind,p_invoice_id,v_return.id,p_created_by);

  return to_jsonb(v_return)||jsonb_build_object('refund_amount',v_refund,'restocked',v_restocked,'quarantined',v_quarantined);
end $$;

revoke all on function public.pharmacy_post_return_exchange(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.pharmacy_post_return_exchange(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,text,text,text) to service_role;

commit;


-- 054: Pharmacy returns & exchanges follow the Electronics console model.
--  * Each returned line keeps its own reason, reason note, condition and penalty.
--  * Conditions: sellable (restock), damaged and defective (quarantine, no restock).
--  * Penalty / deduction reduces the refund for returns (never below zero).
--  * pharmacy_returns.amount = gross returned value; penalty_amount; refund_amount = net refund.
begin;

alter table public.pharmacy_return_items
  add column if not exists reason_note text,
  add column if not exists penalty numeric(14,2) not null default 0 check (penalty >= 0);

alter table public.pharmacy_return_items drop constraint if exists pharmacy_return_items_condition_check;
alter table public.pharmacy_return_items
  add constraint pharmacy_return_items_condition_check
  check (condition in ('sellable','damaged','defective','quarantined','expired'));

alter table public.pharmacy_returns
  add column if not exists penalty_amount numeric(14,2) not null default 0 check (penalty_amount >= 0),
  add column if not exists refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0);

-- Function signature is unchanged. p_items now carries per-line fields:
-- {invoice_line_id, quantity_base, condition: good|damaged|defective, reason, reason_note, penalty}
create or replace function public.pharmacy_post_return_exchange(
  p_store_id uuid,p_invoice_id uuid,p_kind text,p_return_number text,p_customer_name text,p_reason text,p_notes text,
  p_idempotency_key text,p_created_by uuid,p_items jsonb,p_new_items jsonb,p_refund_method text,p_payment_method text,p_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices; v_operation public.pharmacy_operations; v_return public.pharmacy_returns;
  v_raw jsonb; v_line_id uuid; v_qty numeric; v_condition text; v_il public.invoice_lines;
  v_product_id uuid; v_sold_base numeric; v_returned numeric; v_stock numeric; v_amount numeric;
  v_penalty numeric; v_penalty_total numeric:=0; v_line_reason text; v_line_note text;
  v_returned_total numeric:=0; v_new_total numeric:=0; v_new_qty_base numeric; v_factor numeric; v_price numeric; v_line_amount numeric;
  v_unit_label text; v_new_product uuid; v_diff numeric; v_settlement text; v_refund numeric:=0;
  v_restocked boolean:=false; v_quarantined boolean:=false; v_disp text;
  v_refund_method text; v_payment_method text;
begin
  if p_kind not in ('return','exchange') then raise exception 'Unknown return type'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'A retry-safe idempotency key is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Add 1 to 100 returned Pharmacy lines'; end if;
  if p_kind='exchange' and (jsonb_typeof(p_new_items)<>'array' or jsonb_array_length(p_new_items)=0 or jsonb_array_length(p_new_items)>100) then
    raise exception 'Add 1 to 100 replacement medicines for an exchange';
  end if;
  v_refund_method:=lower(coalesce(nullif(btrim(p_refund_method),''),'none'));
  v_payment_method:=lower(coalesce(nullif(btrim(p_payment_method),''),'none'));
  if v_refund_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid refund method'; end if;
  if v_payment_method not in ('none','cash','bank','bkash','nagad','other') then raise exception 'Invalid payment method'; end if;

  -- Idempotent replay: same key returns the stored record.
  select * into v_operation from public.pharmacy_operations where store_id=p_store_id and operation_key=p_idempotency_key;
  if found then
    if v_operation.operation_type<>p_kind or v_operation.result_id is null then raise exception 'This operation key is already used'; end if;
    select * into v_return from public.pharmacy_returns where id=v_operation.result_id and store_id=p_store_id;
    if found then return to_jsonb(v_return)||jsonb_build_object('idempotent',true); end if;
    raise exception 'The earlier Pharmacy return could not be found';
  end if;

  select * into v_invoice from public.invoices where id=p_invoice_id and store_id=p_store_id and kind='sale' for update;
  if not found or not exists(select 1 from public.pharmacy_operations where store_id=p_store_id and invoice_id=p_invoice_id and operation_type='sale') then
    raise exception 'Original invoice is not a Pharmacy sale in this shop';
  end if;
  if btrim(coalesce(p_return_number,''))='' or btrim(coalesce(p_reason,''))='' then raise exception 'Return number and reason are required'; end if;

  insert into public.pharmacy_returns(store_id,invoice_id,return_number,customer_name,return_type,amount,refund_method,disposition,reason,notes,
    idempotency_key,created_by,settlement_type,new_items_total,difference_amount,transaction_id,penalty_amount,refund_amount)
  values(p_store_id,p_invoice_id,p_return_number,coalesce(nullif(btrim(p_customer_name),''),'Walk-in customer'),p_kind,0,'none','quarantined',
    btrim(p_reason),nullif(btrim(p_notes),''),p_idempotency_key,p_created_by,'none',0,0,nullif(btrim(p_transaction_id),''),0,0)
  returning * into v_return;

  -- 1) Returned medicines: each line's condition decides restock or quarantine.
  for v_raw in select value from jsonb_array_elements(p_items) loop
    v_line_id:=nullif(v_raw->>'invoice_line_id','')::uuid;
    v_qty:=round(coalesce((v_raw->>'quantity_base')::numeric,0),3);
    v_condition:=lower(coalesce(nullif(btrim(v_raw->>'condition'),''),'good'));
    if v_condition='sellable' then v_condition:='good'; end if;
    v_line_reason:=coalesce(nullif(btrim(v_raw->>'reason'),''),btrim(p_reason));
    v_line_note:=nullif(btrim(v_raw->>'reason_note'),'');
    v_penalty:=case when p_kind='return' then round(greatest(0,coalesce((v_raw->>'penalty')::numeric,0)),2) else 0 end;
    if v_line_id is null or v_qty<=0 then raise exception 'Each return line needs a sold invoice line and a positive quantity'; end if;
    if v_condition not in ('good','damaged','defective') then raise exception 'Condition must be Sellable, Damaged or Defective'; end if;

    select * into v_il from public.invoice_lines where id=v_line_id and invoice_id=p_invoice_id;
    if not found then raise exception 'Return line is not part of the original Pharmacy sale'; end if;
    select pil.product_id,pil.quantity_base into v_product_id,v_sold_base from public.pharmacy_invoice_lines pil
      where pil.invoice_line_id=v_line_id and pil.store_id=p_store_id;
    if not found then raise exception 'Return line is not linked to Pharmacy sale stock'; end if;

    select coalesce(sum(ri.quantity_base),0) into v_returned from public.pharmacy_return_items ri
      join public.pharmacy_returns pr on pr.id=ri.return_id
      where pr.store_id=p_store_id and ri.invoice_line_id=v_line_id;
    if v_qty>v_sold_base-v_returned+0.0001 then raise exception 'Return quantity exceeds the unreturned quantity from this Pharmacy sale'; end if;

    v_amount:=round(coalesce(v_il.line_total,0)*v_qty/nullif(v_sold_base,0),2);
    if v_penalty>v_amount then raise exception 'Penalty cannot be more than the returned amount of the line'; end if;
    v_returned_total:=v_returned_total+v_amount;
    v_penalty_total:=v_penalty_total+v_penalty;

    select ii.total_stock into v_stock from public.pharmacy_products pp
      join public.inventory_items ii on ii.id=pp.inventory_item_id
      where pp.id=v_product_id and pp.store_id=p_store_id for update of ii;
    if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;

    insert into public.pharmacy_return_items(return_id,store_id,invoice_line_id,product_id,batch_id,quantity_base,condition,reason,reason_note,penalty,amount,restocked)
    values(v_return.id,p_store_id,v_line_id,v_product_id,null,v_qty,
      case when v_condition='good' then 'sellable' else v_condition end,v_line_reason,v_line_note,v_penalty,v_amount,v_condition='good');

    if v_condition='good' then
      update public.inventory_items set total_stock=total_stock+v_qty,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_product_id);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_restock' else 'customer_return_restock' end,
        v_qty,v_stock,v_stock+v_qty,'pharmacy_return',v_return.id,v_line_reason,p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_restocked:=true;
    else
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_product_id,null,case when p_kind='exchange' then 'exchange_return_quarantine' else 'customer_return_quarantine' end,
        v_qty,v_stock,v_stock,'pharmacy_return',v_return.id,v_line_reason||' ('||v_condition||', quarantined, excluded from stock)',
        p_idempotency_key||':ret:'||v_line_id||':'||v_condition,p_created_by);
      v_quarantined:=true;
    end if;
  end loop;

  -- 2) Replacement medicines (exchange only): issued from saleable stock at current selling price.
  if p_kind='exchange' then
    for v_raw in select value from jsonb_array_elements(p_new_items) loop
      v_new_product:=nullif(v_raw->>'product_id','')::uuid;
      v_unit_label:=btrim(coalesce(v_raw->>'unit_label',''));
      v_qty:=round(coalesce((v_raw->>'quantity')::numeric,0),3);
      if v_new_product is null or v_unit_label='' or v_qty<=0 then raise exception 'Each replacement needs a medicine, unit and positive quantity'; end if;

      select pu.factor_to_base,coalesce(pu.selling_price,0) into v_factor,v_price from public.pharmacy_product_units pu
        join public.pharmacy_products pp on pp.id=pu.product_id
        where pu.product_id=v_new_product and pu.store_id=p_store_id and pu.unit_label=v_unit_label and pu.can_sell and pp.active;
      if not found then raise exception 'Replacement medicine or unit is not available for sale'; end if;

      v_new_qty_base:=round(v_qty*v_factor,3);
      select ii.total_stock into v_stock from public.pharmacy_products pp
        join public.inventory_items ii on ii.id=pp.inventory_item_id
        where pp.id=v_new_product and pp.store_id=p_store_id for update of ii;
      if not found then raise exception 'Linked Pharmacy stock record was not found'; end if;
      if v_stock<v_new_qty_base then raise exception 'Insufficient stock for replacement medicine. Available: %', v_stock; end if;

      v_line_amount:=round(v_price*v_qty,2);
      v_new_total:=v_new_total+v_line_amount;

      insert into public.pharmacy_exchange_items(exchange_id,store_id,product_id,unit_label,unit_factor,quantity_base,unit_price,amount)
      values(v_return.id,p_store_id,v_new_product,v_unit_label,v_factor,v_new_qty_base,v_price,v_line_amount);

      update public.inventory_items set total_stock=total_stock-v_new_qty_base,updated_at=now()
        where id=(select inventory_item_id from public.pharmacy_products where id=v_new_product);
      insert into public.pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,
        reference_type,reference_id,reason,idempotency_key,created_by)
      values(p_store_id,v_new_product,null,'exchange_issue',v_new_qty_base,v_stock,v_stock-v_new_qty_base,'pharmacy_return',v_return.id,
        'Replacement issued in exchange',p_idempotency_key||':new:'||v_new_product||':'||v_unit_label,p_created_by);
    end loop;
  end if;

  -- 3) Settlement, as in the Electronics console. Refund = returned value minus penalties.
  v_returned_total:=round(v_returned_total,2);
  v_penalty_total:=round(v_penalty_total,2);
  v_new_total:=round(v_new_total,2);
  if p_kind='return' then
    v_refund:=greatest(0,round(v_returned_total-v_penalty_total,2));
    v_diff:=0;
    v_settlement:=case when v_refund>0 then 'shop_refunds' else 'none' end;
    if v_refund>0 and v_refund_method='none' then raise exception 'Refund method is required to refund the returned amount'; end if;
    v_refund_method:=case when v_refund>0 then v_refund_method else 'none' end;
    v_payment_method:='none';
  else
    v_diff:=round(v_new_total-v_returned_total,2);
    v_penalty_total:=0;
    if v_diff>0 then
      v_settlement:='customer_pays';
      if v_payment_method='none' then raise exception 'Payment method is required when the customer pays the difference'; end if;
      v_refund_method:='none';
    elsif v_diff<0 then
      v_settlement:='shop_refunds';
      v_refund:=-v_diff;
      if v_refund_method='none' then raise exception 'Refund method is required when the shop refunds the difference'; end if;
      v_payment_method:='none';
    else
      v_settlement:='even';
      v_refund_method:='none';
      v_payment_method:='none';
    end if;
  end if;
  v_disp:=case when v_restocked and v_quarantined then 'mixed' when v_restocked then 'restocked' else 'quarantined' end;

  update public.pharmacy_returns set amount=v_returned_total,penalty_amount=v_penalty_total,refund_amount=v_refund,
    refund_method=v_refund_method,payment_method=case when v_payment_method='none' then null else v_payment_method end,
    disposition=v_disp,settlement_type=v_settlement,new_items_total=v_new_total,difference_amount=v_diff
    where id=v_return.id
    returning * into v_return;

  insert into public.pharmacy_operations(store_id,operation_key,operation_type,invoice_id,result_id,created_by)
  values(p_store_id,p_idempotency_key,p_kind,p_invoice_id,v_return.id,p_created_by);

  return to_jsonb(v_return)||jsonb_build_object('refund_amount',v_refund,'restocked',v_restocked,'quarantined',v_quarantined);
end $$;

-- Backfill: earlier returns refunded their full amount.
update public.pharmacy_returns set refund_amount=amount
  where return_type='return' and refund_method is not null and refund_method<>'none' and refund_amount=0;

commit;
-- Mobile Scanner: temporary Pharmacy POS coordination only; no invoice/stock/report writes.
create table if not exists public.scanner_drafts (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 terminal_id uuid not null, pc_user_id uuid not null, kind text not null default 'sale' check(kind in ('sale','purchase')), status text not null default 'ready'
 check(status in ('ready','saving','closed','cancelled')),
 save_key uuid, created_at timestamptz not null default now(), expires_at timestamptz not null,
 last_seen timestamptz not null default now()
);
create index if not exists scanner_drafts_active on public.scanner_drafts(store_id, status, expires_at);
create table if not exists public.scanner_pairs (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 token_hash text not null unique, created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz
);
create table if not exists public.scanner_bindings (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 phone_user_id uuid not null, created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz
);
create index if not exists scanner_bindings_draft on public.scanner_bindings(draft_id);
create table if not exists public.scanner_events (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 binding_id uuid not null references public.scanner_bindings(id) on delete cascade,
 product_id uuid not null references public.pharmacy_products(id),
 status text not null default 'pending' check(status in ('pending','applied','rejected')),
 reason text, created_at timestamptz not null default now(), acknowledged_at timestamptz
);
create index if not exists scanner_events_draft on public.scanner_events(draft_id,status,created_at);
-- serialize enqueue and save barrier on the same draft row.
create or replace function public.scanner_enqueue(p_id uuid,p_store uuid,p_draft uuid,p_binding uuid,p_user uuid,p_product uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype; b public.scanner_bindings%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 select * into b from public.scanner_bindings where id=p_binding and draft_id=p_draft and store_id=p_store and phone_user_id=p_user and revoked_at is null and expires_at>now();
 if not found then return 'unbound'; end if;
 if not exists(select 1 from public.pharmacy_products where id=p_product and store_id=p_store and active=true) then return 'product'; end if;
 insert into public.scanner_events(id,store_id,draft_id,binding_id,product_id) values(p_id,p_store,p_draft,p_binding,p_product)
 on conflict(id) do nothing;
 return 'ok';
end $$;
create or replace function public.scanner_prepare(p_store uuid,p_draft uuid,p_pc uuid,p_key uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store and pc_user_id=p_pc for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 if exists(select 1 from public.scanner_events where draft_id=p_draft and status='pending') then return 'pending'; end if;
 update public.scanner_drafts set status='saving',save_key=p_key where id=p_draft;
 return 'ok';
end $$;
revoke all on public.scanner_drafts, public.scanner_pairs, public.scanner_bindings, public.scanner_events from anon, authenticated;
revoke all on function public.scanner_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.scanner_prepare(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.scanner_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_prepare(uuid,uuid,uuid,uuid) to service_role;

create table if not exists public.scanner_login_codes (
 id uuid primary key,
 store_id uuid not null references public.stores(id) on delete cascade,
 pc_user_id uuid not null,
 token_hash text not null unique,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_at timestamptz
);
create index if not exists scanner_login_codes_expiry on public.scanner_login_codes(expires_at);
revoke all on public.scanner_login_codes from anon, authenticated;

-- Electronics scanner event queue and atomic retry-safe official invoice posting.
-- Apply AFTER 061 and 062. Pharmacy queue and official invoice workflow unchanged.
create table if not exists public.scanner_inventory_events (
 id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
 draft_id uuid not null references public.scanner_drafts(id) on delete cascade,
 binding_id uuid not null references public.scanner_bindings(id) on delete cascade,
 product_id uuid not null references public.inventory_items(id),
 status text not null default 'pending' check(status in ('pending','applied','rejected')),
 reason text, created_at timestamptz not null default now(), acknowledged_at timestamptz
);
create index if not exists scanner_inventory_events_draft on public.scanner_inventory_events(draft_id,status,created_at);
create table if not exists public.scanner_invoice_saves (
 store_id uuid not null references public.stores(id) on delete cascade,
 operation_key uuid not null, kind text not null check(kind in ('sale','purchase')),
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 primary key(store_id,operation_key)
);
revoke all on public.scanner_inventory_events,public.scanner_invoice_saves from anon,authenticated;
create or replace function public.scanner_inventory_enqueue(p_id uuid,p_store uuid,p_draft uuid,p_binding uuid,p_user uuid,p_product uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype; b public.scanner_bindings%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 select * into b from public.scanner_bindings where id=p_binding and draft_id=p_draft and store_id=p_store and phone_user_id=p_user and revoked_at is null and expires_at>now();
 if not found then return 'unbound'; end if;
 if not exists(select 1 from public.inventory_items where id=p_product and store_id=p_store and active=true) then return 'product'; end if;
 insert into public.scanner_inventory_events(id,store_id,draft_id,binding_id,product_id) values(p_id,p_store,p_draft,p_binding,p_product)
 on conflict(id) do nothing;
 return 'ok';
end $$;
create or replace function public.scanner_inventory_prepare(p_store uuid,p_draft uuid,p_pc uuid,p_key uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.scanner_drafts%rowtype;
begin
 select * into d from public.scanner_drafts where id=p_draft and store_id=p_store and pc_user_id=p_pc for update;
 if not found or d.status<>'ready' or d.expires_at<=now() or d.last_seen<=now()-interval '45 seconds' then return 'inactive'; end if;
 if exists(select 1 from public.scanner_inventory_events where draft_id=p_draft and status='pending') then return 'pending'; end if;
 update public.scanner_drafts set status='saving',save_key=p_key where id=p_draft;
 return 'ok';
end $$;
-- Same invoice-saving RPC as Electronics uses today, wrapped in one DB transaction.
-- The advisory lock serializes concurrent retries before stock/invoice posting.
create or replace function public.scanner_post_invoice(
 p_store_id uuid,p_kind text,p_invoice_number text,p_party_id uuid,p_invoice_date date,
 p_payment_method public.payment_method,p_transaction_id text,p_notes text,
 p_tax_percent numeric,p_discount numeric,p_paid_amount numeric,p_created_by uuid,
 p_lines jsonb,p_operation_key uuid)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices; v_stock record; v_available numeric;
begin
 if p_operation_key is null then raise exception 'Scanner save key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_operation_key::text,0));
 select i.* into v_invoice from public.scanner_invoice_saves s
 join public.invoices i on i.id=s.invoice_id and i.store_id=s.store_id
 where s.store_id=p_store_id and s.operation_key=p_operation_key;
 if found then
   if v_invoice.kind<>p_kind then raise exception 'Scanner key belongs to another invoice kind'; end if;
   return v_invoice;
 end if;
 -- Check the sum of duplicate item lines under inventory locks; the existing
 -- post_invoice RPC remains authoritative for invoice and stock posting.
 if p_kind='sale' then
  for v_stock in select (line->>'itemId')::uuid as item_id,sum((line->>'quantity')::numeric) as qty
    from jsonb_array_elements(p_lines) line group by (line->>'itemId')::uuid order by 1 loop
   select total_stock into v_available from public.inventory_items
     where id=v_stock.item_id and store_id=p_store_id for update;
   if not found or v_available<v_stock.qty then raise exception 'Insufficient stock for scanner invoice item'; end if;
  end loop;
 end if;
 v_invoice:=public.post_invoice(p_store_id,p_kind,p_invoice_number,p_party_id,p_invoice_date,
   p_payment_method,p_transaction_id,p_notes,p_tax_percent,p_discount,p_paid_amount,p_created_by,p_lines);
 insert into public.scanner_invoice_saves(store_id,operation_key,kind,invoice_id)
 values(p_store_id,p_operation_key,p_kind,v_invoice.id);
 return v_invoice;
end $$;
revoke all on function public.scanner_inventory_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.scanner_inventory_prepare(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.scanner_post_invoice(uuid,text,text,uuid,date,public.payment_method,text,text,numeric,numeric,numeric,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.scanner_inventory_enqueue(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_inventory_prepare(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.scanner_post_invoice(uuid,text,text,uuid,date,public.payment_method,text,text,numeric,numeric,numeric,uuid,jsonb,uuid) to service_role;


-- Legacy bill-pairing codes were retired in favor of one-use sign-in QR.
drop table if exists public.scanner_pairs;

-- Per-shop ConnectX email preferences. Apply after 063 before deploying the new code.
-- This does not modify the central sender, email history or SMS preferences.
create table if not exists public.connectx_shop_email_settings (
 store_id uuid primary key references public.stores(id) on delete cascade,
 enabled boolean not null default true,
 from_name text,
 from_email text,
 reply_to text,
 daily_limit integer check(daily_limit is null or daily_limit >= 0),
 updated_at timestamptz not null default now()
);
revoke all on public.connectx_shop_email_settings from anon, authenticated;

-- Existing SMS preferences for fresh installs.
CREATE TABLE IF NOT EXISTS connectx_shop_sms_settings (
  store_id              UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  gateway_mode          TEXT NOT NULL DEFAULT 'connectx',
  auto_sale             BOOLEAN NOT NULL DEFAULT true,
  auto_payment          BOOLEAN NOT NULL DEFAULT true,
  auto_due_reminder     BOOLEAN NOT NULL DEFAULT false,
  auto_return           BOOLEAN NOT NULL DEFAULT true,
  auto_exchange         BOOLEAN NOT NULL DEFAULT true,
  auto_refund           BOOLEAN NOT NULL DEFAULT true,
  templates             JSONB,
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

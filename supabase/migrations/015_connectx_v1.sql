-- ConnectX V1: centralized email send and sent-history data.
create type public.connectx_status as enum ('queued','sending','sent','failed');
create table public.connectx_settings (
 id boolean primary key default true check(id), provider text not null default 'brevo_api', from_name text not null default 'EMS ConnectX', from_email text not null, reply_to text, global_daily_limit integer not null default 300 check(global_daily_limit > 0), default_shop_daily_limit integer not null default 20 check(default_shop_daily_limit > 0), enabled boolean not null default false, updated_by uuid references public.ems_owners(id), updated_at timestamptz not null default now()
);
create table public.connectx_messages (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, user_id uuid, recipient_type text not null check(recipient_type in ('customer','supplier','staff','administrator','manual')), recipient_id uuid, invoice_id uuid references public.invoices(id) on delete set null, from_email text not null, to_emails text[] not null, cc_emails text[] not null default '{}', bcc_emails text[] not null default '{}', subject text not null, custom_body text, body_html text not null, provider text not null, provider_message_id text, status public.connectx_status not null default 'queued', error_message text, idempotency_key uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), sent_at timestamptz, unique(store_id,idempotency_key)
);
create index connectx_messages_store_created_idx on public.connectx_messages(store_id,created_at desc);
revoke all on public.connectx_settings,public.connectx_messages from anon,authenticated;
alter table public.connectx_settings enable row level security;
alter table public.connectx_messages enable row level security;

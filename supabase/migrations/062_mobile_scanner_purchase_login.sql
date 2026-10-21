-- Scanner Phase 2: Pharmacy purchase drafts and permanent-header one-use sign-in codes.
-- Temporary coordination only; official invoice/stock tables remain unchanged.
alter table public.scanner_drafts add column if not exists kind text not null default 'sale';
alter table public.scanner_drafts drop constraint if exists scanner_drafts_kind_check;
alter table public.scanner_drafts add constraint scanner_drafts_kind_check check(kind in ('sale','purchase'));
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

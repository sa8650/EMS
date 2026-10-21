-- Migration 038: Add verification_token to returns and exchanges for TrueBill QR verification
alter table public.returns add column if not exists verification_token uuid not null default gen_random_uuid();
create unique index if not exists returns_verification_token_uq on public.returns(verification_token);

alter table public.exchanges add column if not exists verification_token uuid not null default gen_random_uuid();
create unique index if not exists exchanges_verification_token_uq on public.exchanges(verification_token);

-- Persora Connections — EMS side (read-only Vaultium access for Persora).
-- Apply after 066_connectx_direct_sms.sql. Safe to re-run.
--
-- persora_grants stores one row per Persora ↔ EMS-administrator connection.
-- Only a SHA-256 hash of the grant token is stored; the token itself is held
-- (encrypted) by Persora's backend. credential_marker is a hash derived from
-- the administrator's password hash, so changing the EMS password invalidates
-- every existing grant. Integration settings (enabled flag + encrypted shared
-- secret) live in platform_settings under the key 'persora_integration'.

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

revoke all on table public.persora_grants from anon, authenticated;
alter table public.persora_grants enable row level security;
grant all on table public.persora_grants to service_role;

notify pgrst, 'reload schema';

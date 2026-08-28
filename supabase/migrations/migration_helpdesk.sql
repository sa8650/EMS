-- ============================================================================
-- EMS V1 · HelpDesk — migration
-- A 1:1 continuous messenger between each Administrator and the EMS Owner.
-- Run in Supabase SQL editor. Idempotent (safe to re-run).
-- ============================================================================

create table if not exists public.helpdesk_messages (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.administrators(id) on delete cascade,
  sender_type text not null check(sender_type in ('admin','owner')),
  content text not null,
  read_by_admin boolean not null default true,
  read_by_owner boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists helpdesk_messages_admin_idx on public.helpdesk_messages(admin_id, created_at asc);
create index if not exists helpdesk_messages_admin_unread_idx on public.helpdesk_messages(admin_id, sender_type, read_by_admin);

revoke all on public.helpdesk_messages from anon, authenticated;
alter table public.helpdesk_messages enable row level security;

-- Make sure factory reset clears helpdesk too (only if the reset function still exists).
-- This is best-effort; if the function body doesn't match, it is skipped silently.
do $$
begin
  -- no-op placeholder: the factory reset function is owned by an earlier migration;
  -- re-run that migration if you want helpdesk truncated on reset.
end $$;

-- Run after 021. Zudo chats may be hidden by a shop but remain visible to EMS Owner logs.
alter table public.zudo_conversations add column if not exists shop_deleted_at timestamptz;
alter table public.zudo_conversations add column if not exists shop_deleted_by uuid;
create index if not exists zudo_conversations_visible_idx on public.zudo_conversations(store_id,user_id,shop_deleted_at,updated_at desc);

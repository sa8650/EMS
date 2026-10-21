-- Run after 015. Shop users may hide sent history; EMS Owner retains all immutable logs.
alter table public.connectx_messages add column if not exists shop_deleted_at timestamptz;
alter table public.connectx_messages add column if not exists shop_deleted_by uuid;
create index if not exists connectx_messages_shop_visible_idx on public.connectx_messages(store_id,shop_deleted_at,created_at desc);

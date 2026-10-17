-- 039_store_category.sql
-- Add category column to stores table for shop classification (Electronics, Confectionery, etc.)
alter table public.stores
  add column if not exists category text not null default 'General Store';

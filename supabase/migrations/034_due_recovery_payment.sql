-- Run after 012_due_recovery.sql. Adds payment details to each due recovery
-- so the Recovery section can record how the money was received.
-- Safe to re-run. The API detects these columns automatically; recoveries on
-- older schemas (without this migration) keep working without payment details.
alter table public.due_recoveries add column if not exists payment_method text check (payment_method in ('cash','bkash','nagad','bank','other'));
alter table public.due_recoveries add column if not exists transaction_id text;

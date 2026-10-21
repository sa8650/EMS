-- Due recovery: record how each recovery was paid (D1 / SQLite).
-- Run once on an EXISTING database with:
--   npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_due_recovery_payment.sql
-- Fresh databases already get these columns from schema.sql.
-- SQLite cannot ADD COLUMN IF NOT EXISTS: a "duplicate column name" error
-- simply means the migration was already applied.
ALTER TABLE due_recoveries ADD COLUMN payment_method TEXT CHECK(payment_method IN ('cash','bkash','nagad','bank','other'));
ALTER TABLE due_recoveries ADD COLUMN transaction_id TEXT;

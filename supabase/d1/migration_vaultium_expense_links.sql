-- Vaultium: link uploaded files to expense records (D1 / SQLite).
-- Run once on an EXISTING database with:
--   npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_vaultium_expense_links.sql
-- Fresh databases already get these columns from schema.sql.
-- SQLite cannot ADD COLUMN IF NOT EXISTS: a "duplicate column name" error
-- simply means the migration was already applied.
ALTER TABLE vaultium_files ADD COLUMN expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE vaultium_files ADD COLUMN expense_code TEXT;
CREATE INDEX IF NOT EXISTS idx_vaultium_invoice ON vaultium_files(invoice_id);
CREATE INDEX IF NOT EXISTS idx_vaultium_expense ON vaultium_files(expense_id);

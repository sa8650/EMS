-- Persora Connections — EMS side (D1 / SQLite).
-- Run once on an EXISTING database with:
--   npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_persora_integration.sql
-- Fresh databases already get this table from schema.sql / 001_ems_schema.sql.
CREATE TABLE IF NOT EXISTS persora_grants (
  id                TEXT PRIMARY KEY,
  admin_id          TEXT NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL UNIQUE,
  credential_marker TEXT NOT NULL,
  persora_user_ref  TEXT NOT NULL,
  label             TEXT,
  created_at        TEXT NOT NULL,
  last_used_at      TEXT,
  expires_at        TEXT NOT NULL,
  revoked_at        TEXT,
  revoked_reason    TEXT
);
CREATE INDEX IF NOT EXISTS idx_persora_grants_admin ON persora_grants(admin_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_persora_grants_ref ON persora_grants(persora_user_ref, revoked_at);

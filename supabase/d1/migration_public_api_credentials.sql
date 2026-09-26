-- ============================================================================
-- Cloudflare D1 (SQLite) version of 045_public_api_credentials.sql
--
-- EMS Public API credentials + retirement of the ConnectX Android
-- device-token connection. API keys are platform service credentials
-- issued ONLY by the EMS owner (Owner Console → EMS API); the ConnectX
-- central service uses one to read/write the EMS SMS queue via /api/v1/*.
--
-- Apply with:
--   npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_public_api_credentials.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT REFERENCES ems_owners(id) ON DELETE SET NULL,
  store_id      TEXT REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  scopes        TEXT NOT NULL DEFAULT '["read"]',   -- JSON array as TEXT
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at    TEXT,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash  ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_store ON api_keys(store_id);

-- Retire the ConnectX Android device pairing (SMS queue + settings stay).
DROP TABLE IF EXISTS connectx_devices;

-- ============================================================================
-- EMS Public API platform credentials — Cloudflare D1 (SQLite) migration
-- ============================================================================
-- API keys are platform service credentials issued ONLY by the EMS owner
-- (Owner Console → EMS API). The ConnectX central service uses one to
-- authenticate against /api/v1/*: fleet-wide SMS dispatch, administrator
-- login verification (auth:login) for the ConnectX dashboard, and scoped
-- reads of administration/shop data.
--
-- This migration also retires:
--   • the legacy ConnectX Android device-token pairing (connectx_devices)
--   • the owner-managed SIM-balance carrier catalog (connectx_sim_carriers)
--
-- NOTE: api_keys is rebuilt (older drafts used admin_id). Keys are
-- show-once secrets — re-issue them from the Owner Console afterwards.
-- Run once:
--   npx wrangler d1 execute ems-d1 --remote \
--     --file=supabase/d1/migration_public_api_credentials.sql
-- ============================================================================

DROP TABLE IF EXISTS connectx_devices;
DROP TABLE IF EXISTS connectx_sim_carriers;
DROP TABLE IF EXISTS api_keys;

CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT REFERENCES ems_owners(id) ON DELETE SET NULL,
  store_id      TEXT REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,                -- "emsk_a1b2c3d4" (display only)
  key_hash      TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the full key
  scopes        TEXT NOT NULL DEFAULT '[]',   -- JSON array of scopes
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'revoked')),
  expires_at    TEXT,                         -- NULL = never expires
  last_used_at  TEXT,                         -- powers the Online indicator
  revoked_at    TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- connectx_sms_messages.device_id now records the platform API key id that
-- claimed the job (plain TEXT, no foreign key — nothing else changes).

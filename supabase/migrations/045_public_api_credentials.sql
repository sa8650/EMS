-- ============================================================================
-- 045 · EMS Public API credentials + retirement of the ConnectX Android
--       device-token connection.
--
-- External applications (including the ConnectX Android app) now connect
-- EXCLUSIVELY through the EMS Public API (/api/v1/*) using an API key that
-- an administrator creates in the console (API Access page). Keys carry
-- granular scopes (read / write, or per-resource such as sms:read,
-- sms:write, invoices:read) and can be revoked at any time.
--
-- Only a SHA-256 hash of the key is stored — the plaintext key is shown
-- once at creation and never persisted.
--
-- Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  -- NULL = administrator-wide key (all shops); set = locked to one shop
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,          -- first characters, e.g. "emsk_a1b2c3d4" (display only)
  key_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the full key
  scopes        JSONB NOT NULL DEFAULT '["read"]',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at    TIMESTAMP WITH TIME ZONE,
  last_used_at  TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_admin  ON api_keys(admin_id, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_store  ON api_keys(store_id);

-- ----------------------------------------------------------------------------
-- Retire the ConnectX Android device pairing. SMS jobs and per-shop SMS
-- settings are kept (connectx_sms_messages / connectx_shop_sms_settings);
-- connectx_sms_messages.device_id now records the API key id that claimed
-- the job (plain TEXT, no foreign key — nothing else changes).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS connectx_devices;

-- Note for factory reset installs: api_keys is wiped automatically because
-- of ON DELETE CASCADE from administrators.

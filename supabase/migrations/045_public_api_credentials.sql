-- ============================================================================
-- 045 · EMS Public API credentials + retirement of the ConnectX Android
--       device-token connection.
--
-- API keys are PLATFORM SERVICE CREDENTIALS: only the EMS owner creates,
-- manages, and revokes them (Owner Console → EMS API). The ConnectX central
-- service uses such a key to read/write the EMS SMS queue and automate SMS
-- dispatch through the /api/v1/* surface. Administrators never see keys.
-- Keys carry granular scopes (read / write, or per-resource such as
-- sms:read, sms:write, invoices:read) and can be revoked at any time.
-- Email is unaffected: EMS sends email itself (Brevo) without ConnectX.
--
-- Only a SHA-256 hash of the key is stored — the plaintext key is shown
-- once at creation and never persisted.
--
-- Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- the EMS owner who issued the credential (platform-level)
  owner_id      UUID REFERENCES ems_owners(id) ON DELETE SET NULL,
  -- NULL = platform-wide key (every shop); set = locked to one shop
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

CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_store  ON api_keys(store_id);

-- ----------------------------------------------------------------------------
-- Retire the ConnectX Android device pairing. SMS jobs and per-shop SMS
-- settings are kept (connectx_sms_messages / connectx_shop_sms_settings);
-- connectx_sms_messages.device_id now records the platform API key id that
-- claimed the job (plain TEXT, no foreign key — nothing else changes).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS connectx_devices;

-- Factory reset: api_keys is wiped by the reset routine together with the
-- other platform tables.

-- ConnectX Android SMS Gateway: devices, per-shop SMS settings, job claiming
-- Safe to re-run. Does not alter unrelated EMS tables.

CREATE TABLE IF NOT EXISTS connectx_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administrator_id      UUID NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  store_id              UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_public_id      TEXT NOT NULL UNIQUE,
  device_name           TEXT,
  android_version       TEXT,
  sim_subscription_id   TEXT,
  sim_carrier           TEXT,
  phone_number          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_test'
                          CHECK (status IN ('pending_test','active','offline','revoked')),
  is_primary            BOOLEAN NOT NULL DEFAULT false,
  last_seen             TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cx_devices_store ON connectx_devices(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cx_devices_admin ON connectx_devices(administrator_id);

CREATE TABLE IF NOT EXISTS connectx_shop_sms_settings (
  store_id              UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  gateway_mode          TEXT NOT NULL DEFAULT 'connectx',
  auto_sale             BOOLEAN NOT NULL DEFAULT true,
  auto_payment          BOOLEAN NOT NULL DEFAULT true,
  auto_due_reminder     BOOLEAN NOT NULL DEFAULT false,
  auto_return           BOOLEAN NOT NULL DEFAULT true,
  auto_exchange         BOOLEAN NOT NULL DEFAULT true,
  auto_refund           BOOLEAN NOT NULL DEFAULT true,
  templates             JSONB,
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE connectx_sms_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS event_type TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_idempotency
  ON connectx_sms_messages(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cx_sms_claim
  ON connectx_sms_messages(store_id, status, created_at);

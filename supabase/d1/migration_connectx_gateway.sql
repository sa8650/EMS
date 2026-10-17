-- Cloudflare D1 equivalent of 041_connectx_sms_gateway.sql

CREATE TABLE IF NOT EXISTS connectx_devices (
  id                    TEXT PRIMARY KEY,
  administrator_id      TEXT NOT NULL,
  store_id              TEXT NOT NULL,
  device_public_id      TEXT NOT NULL UNIQUE,
  device_name           TEXT,
  android_version       TEXT,
  sim_subscription_id   TEXT,
  sim_carrier           TEXT,
  phone_number          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_test',
  is_primary            INTEGER NOT NULL DEFAULT 0,
  last_seen             TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cx_devices_store ON connectx_devices(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cx_devices_admin ON connectx_devices(administrator_id);

CREATE TABLE IF NOT EXISTS connectx_shop_sms_settings (
  store_id              TEXT PRIMARY KEY,
  enabled               INTEGER NOT NULL DEFAULT 1,
  gateway_mode          TEXT NOT NULL DEFAULT 'connectx',
  auto_sale             INTEGER NOT NULL DEFAULT 1,
  auto_payment          INTEGER NOT NULL DEFAULT 1,
  auto_due_reminder     INTEGER NOT NULL DEFAULT 0,
  auto_return           INTEGER NOT NULL DEFAULT 1,
  auto_exchange         INTEGER NOT NULL DEFAULT 1,
  auto_refund           INTEGER NOT NULL DEFAULT 1,
  templates             TEXT,
  updated_at            TEXT NOT NULL
);

-- SQLite cannot ADD COLUMN IF NOT EXISTS on older builds; ignore errors if columns exist.
-- Run each ALTER independently.
ALTER TABLE connectx_sms_messages ADD COLUMN idempotency_key TEXT;
ALTER TABLE connectx_sms_messages ADD COLUMN claimed_at TEXT;
ALTER TABLE connectx_sms_messages ADD COLUMN event_type TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_idempotency
  ON connectx_sms_messages(store_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_cx_sms_claim
  ON connectx_sms_messages(store_id, status, created_at);

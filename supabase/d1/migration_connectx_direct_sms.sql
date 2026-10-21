-- Direct EMS ↔ ConnectX Android SMS delivery (Cloudflare D1).
-- Apply after migration_connectx_gateway.sql and migration_connect_app.sql.
-- Rebuild only the EMS-owned SMS table because SQLite cannot widen its old
-- status CHECK constraint with ALTER TABLE. All historical columns/data stay.

-- Migration 045 may have removed connectx_devices; recreate its base schema
-- before adding the direct-authentication columns (apply this migration once).
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

ALTER TABLE connectx_devices ADD COLUMN app_version TEXT;
ALTER TABLE connectx_devices ADD COLUMN version_code INTEGER;
ALTER TABLE connectx_devices ADD COLUMN device_token_hash TEXT;
ALTER TABLE connectx_devices ADD COLUMN last_error TEXT;
ALTER TABLE connectx_devices ADD COLUMN revoked_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_connectx_devices_token_hash
  ON connectx_devices(device_token_hash) WHERE device_token_hash IS NOT NULL;

DROP TABLE IF EXISTS connectx_sms_messages_direct_new;
CREATE TABLE connectx_sms_messages_direct_new (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id             TEXT,
  recipient_type      TEXT NOT NULL CHECK(recipient_type IN ('customer','supplier','staff','manual')),
  recipient_id        TEXT,
  recipient_name      TEXT,
  to_phone            TEXT NOT NULL,
  message_type        TEXT NOT NULL,
  event_type          TEXT,
  idempotency_key     TEXT,
  invoice_id          TEXT,
  message_body        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','processing','sent','delivered','failed','unknown','cancelled')),
  device_id           TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  claimed_at          TEXT,
  error_message       TEXT,
  request_id          TEXT,
  connection_id       TEXT,
  sim_used            TEXT,
  result_at           TEXT,
  created_at          TEXT NOT NULL,
  sent_at             TEXT,
  claim_token         TEXT,
  dispatch_phase      TEXT CHECK(dispatch_phase IS NULL OR dispatch_phase IN ('claimed','sending')),
  next_attempt_at     TEXT,
  last_attempt_at     TEXT,
  delivered_at        TEXT,
  delivery_deadline_at TEXT
);

INSERT INTO connectx_sms_messages_direct_new (
  id, store_id, user_id, recipient_type, recipient_id, recipient_name,
  to_phone, message_type, event_type, idempotency_key, invoice_id, message_body,
  status, device_id, attempts, claimed_at, error_message, request_id,
  connection_id, sim_used, result_at, created_at, sent_at,
  claim_token, dispatch_phase, next_attempt_at, last_attempt_at,
  delivered_at, delivery_deadline_at
)
SELECT
  old.id, old.store_id, old.user_id, old.recipient_type, old.recipient_id, old.recipient_name,
  old.to_phone, old.message_type, old.event_type, old.idempotency_key, old.invoice_id, old.message_body,
  CASE lower(old.status)
    WHEN 'queued' THEN 'pending'
    WHEN 'pending' THEN 'pending'
    WHEN 'sending' THEN 'unknown'
    WHEN 'processing' THEN 'unknown'
    WHEN 'success' THEN 'sent'
    WHEN 'sent' THEN 'sent'
    WHEN 'failed' THEN 'failed'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'unknown' THEN 'unknown'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'unknown'
  END,
  CASE WHEN lower(old.status) IN ('sending','processing') THEN NULL ELSE old.device_id END,
  COALESCE(old.attempts, 0),
  CASE WHEN lower(old.status) IN ('sending','processing','success','failed') THEN COALESCE(old.claimed_at, old.result_at, old.created_at) ELSE old.claimed_at END,
  CASE
    WHEN lower(old.status) IN ('sending','processing') AND COALESCE(old.error_message,'') = ''
      THEN 'Legacy relay had started this SMS; delivery outcome is unknown and it was not automatically resent.'
    ELSE old.error_message
  END,
  CASE
    WHEN old.request_id IS NOT NULL AND old.id NOT IN (
      SELECT MIN(id) FROM connectx_sms_messages WHERE request_id IS NOT NULL GROUP BY request_id
    ) THEN 'SMS-LEGACY-' || replace(old.id, '-', '')
    ELSE old.request_id
  END,
  old.connection_id, old.sim_used,
  CASE WHEN lower(old.status) IN ('sending','processing','success','failed') THEN COALESCE(old.result_at, old.sent_at, old.created_at) ELSE old.result_at END,
  old.created_at,
  CASE WHEN lower(old.status) IN ('success','sent') THEN COALESCE(old.sent_at, old.result_at, old.created_at) ELSE old.sent_at END,
  NULL, NULL, NULL, NULL, NULL, NULL
FROM connectx_sms_messages AS old;

DROP TABLE connectx_sms_messages;
ALTER TABLE connectx_sms_messages_direct_new RENAME TO connectx_sms_messages;

CREATE INDEX IF NOT EXISTS idx_cx_sms_store_created ON connectx_sms_messages(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_sms_store_status ON connectx_sms_messages(store_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_idempotency ON connectx_sms_messages(store_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_request_id ON connectx_sms_messages(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cx_sms_direct_claim ON connectx_sms_messages(store_id, status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_cx_sms_delivery_timeout ON connectx_sms_messages(status, sent_at);
CREATE INDEX IF NOT EXISTS idx_cx_sms_claim ON connectx_sms_messages(store_id, status, created_at);

UPDATE connectx_shop_sms_settings SET gateway_mode = 'direct'
WHERE gateway_mode IS NOT NULL AND gateway_mode <> 'direct';

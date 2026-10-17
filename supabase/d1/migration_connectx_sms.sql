-- ConnectX SMS messages table for Cloudflare D1
CREATE TABLE IF NOT EXISTS connectx_sms_messages (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id         TEXT,
  recipient_type  TEXT NOT NULL,
  recipient_id    TEXT,
  recipient_name  TEXT,
  to_phone        TEXT NOT NULL,
  message_type    TEXT NOT NULL,
  invoice_id      TEXT,
  message_body    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed')),
  device_id       TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TEXT NOT NULL,
  sent_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_cx_sms_store_created ON connectx_sms_messages(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_sms_store_status ON connectx_sms_messages(store_id, status);

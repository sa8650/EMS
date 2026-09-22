-- ConnectX SMS messages table for physical SIM SMS Gateway queue
CREATE TABLE IF NOT EXISTS connectx_sms_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id         UUID,
  recipient_type  TEXT NOT NULL,
  recipient_id    UUID,
  recipient_name  TEXT,
  to_phone        TEXT NOT NULL,
  message_type    TEXT NOT NULL,
  invoice_id      UUID,
  message_body    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed')),
  device_id       TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at         TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cx_sms_store_created ON connectx_sms_messages(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_sms_store_status ON connectx_sms_messages(store_id, status);

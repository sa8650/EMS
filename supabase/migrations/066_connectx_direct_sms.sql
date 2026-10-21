-- Direct EMS ↔ ConnectX Android SMS delivery.
-- Apply after 046_connect_app.sql. Existing SMS rows and legacy connection
-- metadata are retained; the old relay is no longer used for new delivery.

-- Migration 045 intentionally dropped the old ConnectX device table while
-- EMS moved to public API credentials. Recreate its legacy/base columns here
-- so this migration works on both that fresh state and older installations.
CREATE TABLE IF NOT EXISTS public.connectx_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administrator_id      UUID NOT NULL REFERENCES public.administrators(id) ON DELETE CASCADE,
  store_id              UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  device_public_id      TEXT NOT NULL UNIQUE,
  device_name           TEXT,
  android_version       TEXT,
  sim_subscription_id   TEXT,
  sim_carrier           TEXT,
  phone_number          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_test'
                          CHECK (status IN ('pending_test','active','offline','revoked')),
  is_primary            BOOLEAN NOT NULL DEFAULT false,
  last_seen             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cx_devices_store ON public.connectx_devices(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cx_devices_admin ON public.connectx_devices(administrator_id);

ALTER TABLE public.connectx_devices
  ADD COLUMN IF NOT EXISTS device_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS version_code INTEGER,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_connectx_devices_token_hash
  ON public.connectx_devices(device_token_hash)
  WHERE device_token_hash IS NOT NULL;

ALTER TABLE public.connectx_sms_messages
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_phase TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_deadline_at TIMESTAMPTZ;

ALTER TABLE public.connectx_sms_messages
  DROP CONSTRAINT IF EXISTS connectx_sms_messages_status_check;

-- Legacy relay PROCESSING/SENDING rows have an ambiguous send outcome. Do not
-- resend them automatically; keep them visible as unknown. SUCCESS only means
-- Android accepted the carrier send request, not that the recipient received it.
UPDATE public.connectx_sms_messages
SET status = CASE lower(status)
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
error_message = CASE
  WHEN lower(status) IN ('sending','processing') AND COALESCE(error_message,'') = ''
    THEN 'Legacy relay had started this SMS; delivery outcome is unknown and it was not automatically resent.'
  ELSE error_message
END,
result_at = CASE
  WHEN lower(status) IN ('sending','processing','success','failed') THEN COALESCE(result_at, sent_at, created_at)
  ELSE result_at
END,
sent_at = CASE WHEN lower(status) IN ('success','sent') THEN COALESCE(sent_at, result_at, created_at) ELSE sent_at END;

UPDATE public.connectx_sms_messages
SET status = 'unknown',
    result_at = COALESCE(result_at, claimed_at, created_at),
    error_message = COALESCE(error_message, 'Legacy processing row has no direct-device claim token; delivery outcome is unknown.')
WHERE status = 'processing' AND (claim_token IS NULL OR claim_token = '');

ALTER TABLE public.connectx_sms_messages
  ADD CONSTRAINT connectx_sms_messages_status_check
  CHECK (status IN ('pending','processing','sent','delivered','failed','unknown','cancelled'));

ALTER TABLE public.connectx_sms_messages
  DROP CONSTRAINT IF EXISTS connectx_sms_messages_dispatch_phase_check;
ALTER TABLE public.connectx_sms_messages
  ADD CONSTRAINT connectx_sms_messages_dispatch_phase_check
  CHECK (dispatch_phase IS NULL OR dispatch_phase IN ('claimed','sending'));

CREATE INDEX IF NOT EXISTS idx_cx_sms_direct_claim
  ON public.connectx_sms_messages(store_id, status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_cx_sms_delivery_timeout
  ON public.connectx_sms_messages(status, sent_at)
  WHERE status = 'sent';

-- Older relay versions did not enforce unique Request IDs. Keep every row and
-- give only duplicate historical IDs a deterministic legacy identifier before
-- adding the direct-queue uniqueness constraint.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY request_id ORDER BY created_at, id) AS duplicate_number
  FROM public.connectx_sms_messages
  WHERE request_id IS NOT NULL
)
UPDATE public.connectx_sms_messages AS target
SET request_id = 'SMS-LEGACY-DUP-' || replace(target.id::text, '-', '')
FROM ranked
WHERE ranked.id = target.id AND ranked.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_request_id
  ON public.connectx_sms_messages(request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.connectx_shop_sms_settings
  ALTER COLUMN gateway_mode SET DEFAULT 'direct';
UPDATE public.connectx_shop_sms_settings SET gateway_mode = 'direct'
WHERE gateway_mode IS DISTINCT FROM 'direct';

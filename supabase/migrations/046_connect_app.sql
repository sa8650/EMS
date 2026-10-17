-- EMS Connect App
-- Replaces the public API-key integration. EMS and ConnectX stay independent:
-- they exchange signed Connect App messages, never database access.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.connect_identity (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  application_id     TEXT NOT NULL UNIQUE,
  application_name   TEXT NOT NULL DEFAULT 'EMS',
  kind               TEXT NOT NULL DEFAULT 'product',
  endpoint_override  TEXT NOT NULL DEFAULT '',
  sms_seq            INTEGER NOT NULL DEFAULT 10000,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connect_requests (
  id                     TEXT PRIMARY KEY,
  direction              TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  pairing_code           TEXT,
  remote_application_id  TEXT,
  remote_application_name TEXT,
  remote_endpoint        TEXT,
  display_name           TEXT,
  requested_permissions  TEXT,
  status                 TEXT NOT NULL,
  connection_id          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.connect_connections (
  id                      TEXT PRIMARY KEY,
  remote_application_id   TEXT NOT NULL,
  remote_application_name TEXT NOT NULL,
  remote_endpoint         TEXT NOT NULL,
  remote_kind             TEXT NOT NULL DEFAULT 'gateway',
  permissions             TEXT NOT NULL DEFAULT '[]',
  shared_secret           TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'ACTIVE',
  display_name            TEXT,
  connected_at            TIMESTAMPTZ,
  disconnected_at         TIMESTAMPTZ,
  last_seen_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.connectx_sms_messages ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE public.connectx_sms_messages ADD COLUMN IF NOT EXISTS connection_id TEXT;
ALTER TABLE public.connectx_sms_messages ADD COLUMN IF NOT EXISTS sim_used TEXT;
ALTER TABLE public.connectx_sms_messages ADD COLUMN IF NOT EXISTS result_at TIMESTAMPTZ;

ALTER TABLE public.connectx_sms_messages DROP CONSTRAINT IF EXISTS connectx_sms_messages_status_check;
ALTER TABLE public.connectx_sms_messages ADD CONSTRAINT connectx_sms_messages_status_check
  CHECK (status IN ('queued','sending','sent','failed','PENDING','PROCESSING','SUCCESS','FAILED'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_sms_request_id
  ON public.connectx_sms_messages(request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.connect_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_connections ENABLE ROW LEVEL SECURITY;

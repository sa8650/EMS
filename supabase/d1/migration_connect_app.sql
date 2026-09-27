-- EMS Connect App (Cloudflare D1). Apply after schema.sql on an existing database.
CREATE TABLE IF NOT EXISTS connect_identity (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  application_id     TEXT NOT NULL UNIQUE,
  application_name   TEXT NOT NULL DEFAULT 'EMS',
  kind               TEXT NOT NULL DEFAULT 'product',
  endpoint_override  TEXT NOT NULL DEFAULT '',
  sms_seq            INTEGER NOT NULL DEFAULT 10000,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connect_requests (
  id                      TEXT PRIMARY KEY,
  direction               TEXT NOT NULL,
  pairing_code            TEXT,
  remote_application_id   TEXT,
  remote_application_name TEXT,
  remote_endpoint         TEXT,
  display_name            TEXT,
  requested_permissions   TEXT,
  status                  TEXT NOT NULL,
  connection_id           TEXT,
  created_at              TEXT NOT NULL,
  expires_at              TEXT
);

CREATE TABLE IF NOT EXISTS connect_connections (
  id                      TEXT PRIMARY KEY,
  remote_application_id   TEXT NOT NULL,
  remote_application_name TEXT NOT NULL,
  remote_endpoint         TEXT NOT NULL,
  remote_kind             TEXT NOT NULL DEFAULT 'gateway',
  permissions             TEXT NOT NULL DEFAULT '[]',
  shared_secret           TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'ACTIVE',
  display_name            TEXT,
  connected_at            TEXT,
  disconnected_at         TEXT,
  last_seen_at            TEXT,
  created_at              TEXT NOT NULL
);

ALTER TABLE connectx_sms_messages ADD COLUMN request_id TEXT;
ALTER TABLE connectx_sms_messages ADD COLUMN connection_id TEXT;
ALTER TABLE connectx_sms_messages ADD COLUMN sim_used TEXT;
ALTER TABLE connectx_sms_messages ADD COLUMN result_at TEXT;

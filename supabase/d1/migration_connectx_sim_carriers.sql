-- EMS owner-managed carrier USSD catalog for ConnectX; no USSD codes are seeded.
-- Apply to an existing Cloudflare D1 database before deploying the new API.
CREATE TABLE IF NOT EXISTS connectx_sim_carriers (
  id                   TEXT PRIMARY KEY,
  carrier_name         TEXT NOT NULL,
  mcc_mnc              TEXT UNIQUE CHECK (mcc_mnc IS NULL OR
    (length(mcc_mnc) IN (5, 6) AND mcc_mnc NOT GLOB '*[^0-9]*')),
  carrier_identifier   TEXT NOT NULL DEFAULT '',
  balance_ussd_code    TEXT NOT NULL DEFAULT '',
  sms_quota_ussd_code  TEXT NOT NULL DEFAULT '',
  balance_pattern      TEXT NOT NULL DEFAULT '',
  sms_pattern          TEXT NOT NULL DEFAULT '',
  active               INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (mcc_mnc IS NOT NULL OR length(trim(carrier_identifier)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_connectx_sim_carriers_active ON connectx_sim_carriers(active, mcc_mnc);

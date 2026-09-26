-- EMS owner-managed carrier USSD catalog for ConnectX (no carrier codes are seeded).
-- Apply once to the Supabase database used by the deployed EMS API.
CREATE TABLE IF NOT EXISTS public.connectx_sim_carriers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name         TEXT NOT NULL,
  mcc_mnc              TEXT UNIQUE CHECK (mcc_mnc IS NULL OR mcc_mnc ~ '^[0-9]{5,6}$'),
  carrier_identifier   TEXT NOT NULL DEFAULT '',
  balance_ussd_code    TEXT NOT NULL DEFAULT '',
  sms_quota_ussd_code  TEXT NOT NULL DEFAULT '',
  balance_pattern      TEXT NOT NULL DEFAULT '',
  sms_pattern          TEXT NOT NULL DEFAULT '',
  active               BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT connectx_carrier_identity CHECK (mcc_mnc IS NOT NULL OR length(trim(carrier_identifier)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_connectx_sim_carriers_active ON public.connectx_sim_carriers(active, mcc_mnc);

-- Access only through the EMS Pages Function, which enforces owner/device roles.
-- The service-role database connection bypasses RLS; browsers cannot read USSD codes directly.
ALTER TABLE public.connectx_sim_carriers ENABLE ROW LEVEL SECURITY;

-- ConnectX v1.5.1: retire SMS-quota carrier settings; only SIM balance remains.
-- Run AFTER 043_connectx_sim_carriers.sql on an existing Supabase database.
-- Back up first if you need the old SMS-quota codes/patterns: these values are deleted.
-- Safe to re-run. Existing carrier rows and balance settings are preserved.
ALTER TABLE public.connectx_sim_carriers
  DROP COLUMN IF EXISTS sms_quota_ussd_code,
  DROP COLUMN IF EXISTS sms_pattern;

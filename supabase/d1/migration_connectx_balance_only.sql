-- ConnectX v1.5.1: remove the no-longer-used SMS-quota fields from an
-- EXISTING D1 connectx_sim_carriers table created with
-- migration_connectx_sim_carriers.sql (the earlier two-code schema).
-- Back up first if you need the old SMS-quota codes/patterns: they are deleted.
-- RUN ONCE. Do NOT run on a fresh database initialized with the revised
-- schema.sql (it already has the balance-only table and no columns to drop).
-- Apply before deploying the balance-only EMS API and Android update.
ALTER TABLE connectx_sim_carriers DROP COLUMN sms_quota_ussd_code;
ALTER TABLE connectx_sim_carriers DROP COLUMN sms_pattern;

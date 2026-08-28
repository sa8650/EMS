-- Run this query by itself and wait for success before running 018_current_license_entitlements.sql.
alter type public.store_status add value if not exists 'read_only';

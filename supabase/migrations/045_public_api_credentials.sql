-- ============================================================================
-- 045 — EMS Public API platform credentials
-- ============================================================================
-- API keys are PLATFORM SERVICE CREDENTIALS: only the EMS owner creates,
-- manages, and revokes them (Owner Console → EMS API). The ConnectX central
-- service uses such a key to authenticate against /api/v1/* — it automates
-- SMS dispatch fleet-wide, verifies administrator logins for the ConnectX
-- dashboard (auth:login scope), and reads administration/shop data with
-- granular scopes. Administrators never see or manage keys.
-- Email is unaffected: EMS sends email itself (Brevo) without ConnectX.
--
-- This migration is idempotent and self-healing:
--   • drops the retired ConnectX Android device-token pairing table
--   • drops the retired owner-managed SIM-balance carrier catalog
--   • replaces any older api_keys table that still used admin_id
--   • reloads the PostgREST schema cache so the new columns are visible
--     immediately (fixes: "Could not find the 'owner_id' column of
--     'api_keys' in the schema cache")
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Retire the legacy ConnectX Android device pairing --------------------
DROP TABLE IF EXISTS public.connectx_devices CASCADE;

-- 2. Retire the owner-managed SIM balance carrier catalog ------------------
DROP TABLE IF EXISTS public.connectx_sim_carriers CASCADE;

-- 3. Platform API credentials ----------------------------------------------
-- If an earlier draft of this migration created api_keys with admin_id,
-- rebuild it (keys are show-once secrets; they must be re-issued anyway).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys'
      AND column_name = 'admin_id'
  ) THEN
    DROP TABLE public.api_keys CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- the EMS owner who issued the credential (platform-level)
  owner_id      UUID REFERENCES public.ems_owners(id) ON DELETE SET NULL,
  -- NULL = platform-wide key (every shop); set = locked to one shop
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,                -- "emsk_a1b2c3d4" (display only)
  key_hash      TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the full key
  scopes        JSONB NOT NULL DEFAULT '[]',  -- e.g. ["sms:read","sms:write"]
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'revoked')),
  expires_at    TIMESTAMP WITH TIME ZONE,     -- NULL = never expires
  last_used_at  TIMESTAMP WITH TIME ZONE,     -- powers the Online indicator
  revoked_at    TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON public.api_keys(status);

-- Access only through the EMS Pages Function (service-role connection).
-- Browsers and external apps can never read this table directly.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- 4. Note on SMS jobs -------------------------------------------------------
-- connectx_sms_messages.device_id now records the platform API key id that
-- claimed the job (plain TEXT, no foreign key — nothing else changes).

-- 5. Reload the PostgREST schema cache --------------------------------------
NOTIFY pgrst, 'reload schema';

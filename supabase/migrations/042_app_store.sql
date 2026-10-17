-- ══════════════════════════════════════════════════════════════════════
-- 042_app_store.sql
-- EMS Official App Store: published ecosystem applications, signed APK metadata,
-- version code comparators, Cloudflare R2 object tracking, and mandatory update locks.
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_store_apps (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name         TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  version              TEXT NOT NULL DEFAULT '1.0.0',
  version_code         INTEGER NOT NULL DEFAULT 1,
  icon_url             TEXT NOT NULL DEFAULT '',
  icon_r2_key          TEXT,
  apk_url              TEXT NOT NULL DEFAULT '',
  apk_r2_key           TEXT,
  r2_key               TEXT,
  apk_filename         TEXT NOT NULL DEFAULT '',
  apk_size_bytes       BIGINT NOT NULL DEFAULT 0,
  mandatory            BOOLEAN NOT NULL DEFAULT false,
  release_notes        TEXT NOT NULL DEFAULT '',
  published            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Safely add new columns if table already existed without them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_store_apps' AND column_name='icon_r2_key') THEN
    ALTER TABLE public.app_store_apps ADD COLUMN icon_r2_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_store_apps' AND column_name='apk_r2_key') THEN
    ALTER TABLE public.app_store_apps ADD COLUMN apk_r2_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_store_apps' AND column_name='r2_key') THEN
    ALTER TABLE public.app_store_apps ADD COLUMN r2_key TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_store_pkg ON public.app_store_apps(package_name);
CREATE INDEX IF NOT EXISTS idx_app_store_pub ON public.app_store_apps(published, version_code DESC, created_at DESC);

-- Storefront metadata, independent of signed release and download security.
ALTER TABLE public.app_store_apps ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'EMS applications';
ALTER TABLE public.app_store_apps ADD COLUMN IF NOT EXISTS developer text NOT NULL DEFAULT 'Dexter Studio';
ALTER TABLE public.app_store_apps ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_store_apps ADD COLUMN IF NOT EXISTS web_url text NOT NULL DEFAULT '';
ALTER TABLE public.app_store_apps ADD COLUMN IF NOT EXISTS screenshot_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

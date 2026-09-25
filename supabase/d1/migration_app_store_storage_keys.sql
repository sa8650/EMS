-- Upgrade EXISTING Cloudflare D1 app_store_apps tables created before
-- icon_r2_key and apk_r2_key were introduced. Run once per existing DB.
-- New deployments using schema.sql or migration_app_store.sql already have
-- these columns and must NOT run this upgrade a second time.
ALTER TABLE app_store_apps ADD COLUMN icon_r2_key TEXT;
ALTER TABLE app_store_apps ADD COLUMN apk_r2_key TEXT;
CREATE INDEX IF NOT EXISTS idx_app_store_pub_version ON app_store_apps(published, version_code DESC);

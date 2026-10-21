-- Apply once to existing D1 databases after migration_app_store.sql.
ALTER TABLE app_store_apps ADD COLUMN category TEXT NOT NULL DEFAULT 'EMS applications';
ALTER TABLE app_store_apps ADD COLUMN developer TEXT NOT NULL DEFAULT 'Dexter Studio';
ALTER TABLE app_store_apps ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_store_apps ADD COLUMN web_url TEXT NOT NULL DEFAULT '';
ALTER TABLE app_store_apps ADD COLUMN screenshot_urls TEXT NOT NULL DEFAULT '[]';

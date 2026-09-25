CREATE TABLE IF NOT EXISTS app_store_apps (
  id                   TEXT PRIMARY KEY,
  package_name         TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  version              TEXT NOT NULL DEFAULT '1.0.0',
  version_code         INTEGER NOT NULL DEFAULT 1,
  icon_url             TEXT NOT NULL DEFAULT '',
  icon_r2_key          TEXT,
  apk_url              TEXT NOT NULL DEFAULT '',
  apk_r2_key           TEXT,
  apk_size_bytes       INTEGER NOT NULL DEFAULT 0,
  apk_filename         TEXT NOT NULL DEFAULT '',
  r2_key               TEXT,
  mandatory            INTEGER NOT NULL DEFAULT 0,
  release_notes        TEXT NOT NULL DEFAULT '',
  published            INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_app_store_pkg ON app_store_apps(package_name);
CREATE INDEX IF NOT EXISTS idx_app_store_pub ON app_store_apps(published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_store_pub_version ON app_store_apps(published, version_code DESC);

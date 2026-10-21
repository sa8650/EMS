-- Run once on an existing scanner D1 database; fresh schemas already include these fields.
ALTER TABLE scanner_drafts ADD COLUMN kind TEXT NOT NULL DEFAULT 'sale' CHECK(kind IN ('sale','purchase'));
CREATE TABLE IF NOT EXISTS scanner_login_codes (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 pc_user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX IF NOT EXISTS scanner_login_codes_expiry ON scanner_login_codes(expires_at);

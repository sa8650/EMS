-- Apply after the ConnectX/SMS gateway upgrades, before deploying the new code.
CREATE TABLE IF NOT EXISTS connectx_shop_email_settings (
 store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 1,
 from_name TEXT,
 from_email TEXT,
 reply_to TEXT,
 daily_limit INTEGER CHECK(daily_limit IS NULL OR daily_limit >= 0),
 updated_at TEXT NOT NULL
);

-- Mobile Scanner: ephemeral routing, no official invoice/stock/report writes.
CREATE TABLE IF NOT EXISTS scanner_drafts (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 terminal_id TEXT NOT NULL, pc_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready'
 CHECK(status IN ('ready','saving','closed','cancelled')),
 save_key TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL, last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS scanner_drafts_active ON scanner_drafts(store_id,status,expires_at);
CREATE TABLE IF NOT EXISTS scanner_pairs (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 draft_id TEXT NOT NULL REFERENCES scanner_drafts(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS scanner_bindings (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 draft_id TEXT NOT NULL REFERENCES scanner_drafts(id) ON DELETE CASCADE,
 phone_user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS scanner_bindings_draft ON scanner_bindings(draft_id);
CREATE TABLE IF NOT EXISTS scanner_events (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 draft_id TEXT NOT NULL REFERENCES scanner_drafts(id) ON DELETE CASCADE,
 binding_id TEXT NOT NULL REFERENCES scanner_bindings(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES pharmacy_products(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
 reason TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS scanner_events_draft ON scanner_events(draft_id,status,created_at);

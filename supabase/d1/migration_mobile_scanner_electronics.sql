-- Apply after migration_mobile_scanner_purchase_login.sql.
CREATE TABLE IF NOT EXISTS scanner_inventory_events (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 draft_id TEXT NOT NULL REFERENCES scanner_drafts(id) ON DELETE CASCADE,
 binding_id TEXT NOT NULL REFERENCES scanner_bindings(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES inventory_items(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
 reason TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS scanner_inventory_events_draft ON scanner_inventory_events(draft_id,status,created_at);
CREATE TABLE IF NOT EXISTS scanner_invoice_saves (
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 operation_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sale','purchase')),
 invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
 PRIMARY KEY(store_id,operation_key)
);

-- Remove unused old draft pairing codes.
DROP TABLE IF EXISTS scanner_pairs;

-- Guard concurrent invoice saves against negative stock even if both preflight reads pass.
CREATE TRIGGER IF NOT EXISTS inventory_prevent_negative_stock BEFORE UPDATE OF total_stock ON inventory_items
WHEN NEW.total_stock < 0 BEGIN SELECT RAISE(ABORT, 'Insufficient stock for invoice item'); END;

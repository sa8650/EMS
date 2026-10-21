-- Apply once to existing D1 Pharmacy installations. Preserves legacy batch-linked
-- pharmacy_supplier_returns unchanged; new purchases are not batch-linked.
CREATE TABLE IF NOT EXISTS pharmacy_supplier_return_headers (
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 purchase_invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
 return_number TEXT NOT NULL,return_date TEXT NOT NULL,reason TEXT NOT NULL,notes TEXT,
 settlement_method TEXT NOT NULL CHECK(settlement_method IN ('refund','credit')),
 amount REAL NOT NULL CHECK(amount>=0),due_reduction REAL NOT NULL DEFAULT 0 CHECK(due_reduction>=0),
 idempotency_key TEXT NOT NULL,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(store_id,return_number),UNIQUE(store_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pharmacy_supplier_return_headers_purchase_idx ON pharmacy_supplier_return_headers(store_id,purchase_invoice_id,created_at DESC);
CREATE TABLE IF NOT EXISTS pharmacy_supplier_return_lines (
 id TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES pharmacy_supplier_return_headers(id) ON DELETE CASCADE,
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
 product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,
 quantity_base REAL NOT NULL CHECK(quantity_base>0),amount REAL NOT NULL CHECK(amount>=0)
);
CREATE INDEX IF NOT EXISTS pharmacy_supplier_return_lines_invoice_idx ON pharmacy_supplier_return_lines(store_id,invoice_line_id);
CREATE TRIGGER IF NOT EXISTS pharmacy_supplier_return_quantity_guard BEFORE INSERT ON pharmacy_supplier_return_lines
WHEN NEW.quantity_base+COALESCE((SELECT SUM(l.quantity_base) FROM pharmacy_supplier_return_lines l WHERE l.store_id=NEW.store_id AND l.invoice_line_id=NEW.invoice_line_id),0) > COALESCE((SELECT x.quantity_base FROM pharmacy_invoice_lines x JOIN invoice_lines il ON il.id=x.invoice_line_id JOIN pharmacy_supplier_return_headers h ON h.id=NEW.return_id WHERE x.store_id=NEW.store_id AND x.invoice_line_id=NEW.invoice_line_id AND il.invoice_id=h.purchase_invoice_id AND h.store_id=NEW.store_id AND x.product_id=NEW.product_id),0)+0.000001
BEGIN SELECT RAISE(ABORT,'pharmacy_supplier_return_quantity_exceeded'); END;

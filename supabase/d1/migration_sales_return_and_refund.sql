-- Migration (D1 flavour): Sales Return & Refund
-- Adds returns, return_items, and inventory_stock_movements tables.

CREATE TABLE IF NOT EXISTS returns (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_id          TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  return_number       TEXT NOT NULL,
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,
  return_date         TEXT NOT NULL DEFAULT (date('now')),
  subtotal            NUMERIC NOT NULL DEFAULT 0,
  tax_amount          NUMERIC NOT NULL DEFAULT 0,
  discount_amount     NUMERIC NOT NULL DEFAULT 0,
  penalty_amount      NUMERIC NOT NULL DEFAULT 0,
  total_return_amount NUMERIC NOT NULL DEFAULT 0,
  refunded_amount     NUMERIC NOT NULL DEFAULT 0,
  refund_method       TEXT DEFAULT 'cash',
  transaction_id      TEXT,
  status              TEXT NOT NULL DEFAULT 'refunded' CHECK(status IN ('pending_refund','partially_refunded','refunded')),
  notes               TEXT,
  created_by          TEXT,
  verification_token  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_returns_store ON returns(store_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_verification_token ON returns(verification_token);

CREATE TABLE IF NOT EXISTS return_items (
  id                  TEXT PRIMARY KEY,
  return_id           TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  invoice_line_id     TEXT REFERENCES invoice_lines(id) ON DELETE SET NULL,
  item_id             TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity            NUMERIC NOT NULL CHECK(quantity > 0),
  unit_price          NUMERIC NOT NULL CHECK(unit_price >= 0),
  tax_percent         NUMERIC NOT NULL DEFAULT 0,
  tax_amount          NUMERIC NOT NULL DEFAULT 0,
  discount            NUMERIC NOT NULL DEFAULT 0,
  penalty             NUMERIC NOT NULL DEFAULT 0,
  return_amount       NUMERIC NOT NULL CHECK(return_amount >= 0),
  reason              TEXT NOT NULL CHECK(reason IN ('Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other')),
  reason_note         TEXT,
  condition           TEXT NOT NULL CHECK(condition IN ('Sellable','Damaged','Defective','Warranty')),
  imei_serial         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_item ON return_items(item_id);

-- Drop obsolete standalone refunds table if present (refund is integrated directly on return)
DROP TABLE IF EXISTS refunds;

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  return_id           TEXT REFERENCES returns(id) ON DELETE CASCADE,
  movement_type       TEXT NOT NULL CHECK(movement_type IN ('return_restock','return_damaged','return_defective','return_warranty')),
  quantity            NUMERIC NOT NULL,
  stock_before        NUMERIC,
  stock_after         NUMERIC,
  condition           TEXT NOT NULL,
  notes               TEXT,
  created_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_store ON inventory_stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_return ON inventory_stock_movements(return_id);

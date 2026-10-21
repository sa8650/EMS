-- Migration (D1 flavour): Sales Exchange
-- Adds exchanges and exchange_items tables, and updates inventory_stock_movements with exchange_id.

CREATE TABLE IF NOT EXISTS exchanges (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_id          TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  exchange_number     TEXT NOT NULL,
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,
  exchange_date       TEXT NOT NULL DEFAULT (date('now')),
  returned_total      NUMERIC NOT NULL DEFAULT 0,
  new_items_subtotal  NUMERIC NOT NULL DEFAULT 0,
  new_items_tax       NUMERIC NOT NULL DEFAULT 0,
  new_items_discount  NUMERIC NOT NULL DEFAULT 0,
  new_items_total     NUMERIC NOT NULL DEFAULT 0,
  difference_amount   NUMERIC NOT NULL DEFAULT 0,
  action_type         TEXT NOT NULL DEFAULT 'even' CHECK(action_type IN ('payment','refund','even')),
  payment_method      TEXT CHECK(payment_method IN ('cash','bank','bkash','nagad','other','none')) DEFAULT 'none',
  transaction_id      TEXT,
  status              TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','cancelled')),
  notes               TEXT,
  created_by          TEXT,
  verification_token  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, exchange_number)
);

CREATE INDEX IF NOT EXISTS idx_exchanges_store ON exchanges(store_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_invoice ON exchanges(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchanges_verification_token ON exchanges(verification_token);

CREATE TABLE IF NOT EXISTS exchange_items (
  id                  TEXT PRIMARY KEY,
  exchange_id         TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  item_type           TEXT NOT NULL CHECK(item_type IN ('returned','new')),
  invoice_line_id     TEXT REFERENCES invoice_lines(id) ON DELETE SET NULL,
  item_id             TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity            NUMERIC NOT NULL CHECK(quantity > 0),
  unit_price          NUMERIC NOT NULL CHECK(unit_price >= 0),
  tax_percent         NUMERIC NOT NULL DEFAULT 0,
  tax_amount          NUMERIC NOT NULL DEFAULT 0,
  discount            NUMERIC NOT NULL DEFAULT 0,
  total_amount        NUMERIC NOT NULL CHECK(total_amount >= 0),
  reason              TEXT,
  reason_note         TEXT,
  condition           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange ON exchange_items(exchange_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_item ON exchange_items(item_id);

CREATE TABLE IF NOT EXISTS inventory_stock_movements_new (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  return_id           TEXT REFERENCES returns(id) ON DELETE CASCADE,
  exchange_id         TEXT REFERENCES exchanges(id) ON DELETE CASCADE,
  movement_type       TEXT NOT NULL,
  quantity            NUMERIC NOT NULL,
  stock_before        NUMERIC,
  stock_after         NUMERIC,
  condition           TEXT NOT NULL,
  notes               TEXT,
  created_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO inventory_stock_movements_new (id, store_id, item_id, return_id, movement_type, quantity, stock_before, stock_after, condition, notes, created_by, created_at)
  SELECT id, store_id, item_id, return_id, movement_type, quantity, stock_before, stock_after, condition, notes, created_by, created_at FROM inventory_stock_movements;

DROP TABLE inventory_stock_movements;
ALTER TABLE inventory_stock_movements_new RENAME TO inventory_stock_movements;

CREATE INDEX IF NOT EXISTS idx_inv_mov_store ON inventory_stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_return ON inventory_stock_movements(return_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_exchange ON inventory_stock_movements(exchange_id);

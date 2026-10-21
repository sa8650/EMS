-- EMS CShop additive migration for Cloudflare D1.
-- Existing stores are backfilled as Electronics; existing inventory is untouched.

ALTER TABLE stores ADD COLUMN shop_type TEXT NOT NULL DEFAULT 'electronics' CHECK(shop_type IN ('electronics','clothing'));
ALTER TABLE invoice_lines ADD COLUMN cost_price NUMERIC;

CREATE TABLE IF NOT EXISTS clothing_products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  style_code TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs' CHECK(unit IN ('pcs','pair','set','dozen','meter','yard')),
  purchase_unit TEXT NOT NULL DEFAULT 'pcs' CHECK(purchase_unit IN ('pcs','pair','set','dozen','meter','yard')),
  purchase_to_stock REAL NOT NULL DEFAULT 1 CHECK(purchase_to_stock > 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
  sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
  reorder_threshold REAL NOT NULL DEFAULT 0 CHECK(reorder_threshold >= 0),
  images TEXT NOT NULL DEFAULT '[]',
  measurements TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, style_code)
);
CREATE INDEX IF NOT EXISTS clothing_products_store_category_idx ON clothing_products(store_id, category, name);

CREATE TABLE IF NOT EXISTS clothing_variants (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES clothing_products(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL UNIQUE REFERENCES inventory_items(id) ON DELETE RESTRICT,
  size_label TEXT,
  size_system TEXT,
  color TEXT,
  variant_sku TEXT NOT NULL,
  barcode TEXT,
  cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
  sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
  reorder_threshold REAL NOT NULL DEFAULT 0 CHECK(reorder_threshold >= 0),
  measurements TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, variant_sku)
);
CREATE INDEX IF NOT EXISTS clothing_variants_store_product_idx ON clothing_variants(store_id, product_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS clothing_variants_barcode_uq ON clothing_variants(store_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS clothing_variants_matrix_uq ON clothing_variants(product_id, ifnull(nullif(lower(trim(size_label)),''),''), ifnull(nullif(lower(trim(color)),''),''));

CREATE TABLE IF NOT EXISTS clothing_size_profiles (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  size_system TEXT NOT NULL DEFAULT 'alpha',
  sizes TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, category)
);

CREATE TABLE IF NOT EXISTS clothing_purchase_returns (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  purchase_invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  return_number TEXT NOT NULL,
  return_date TEXT NOT NULL DEFAULT (date('now')),
  total_return_amount REAL NOT NULL DEFAULT 0 CHECK(total_return_amount >= 0),
  reason TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, return_number)
);
CREATE INDEX IF NOT EXISTS clothing_purchase_returns_invoice_idx ON clothing_purchase_returns(store_id, purchase_invoice_id);

CREATE TABLE IF NOT EXISTS clothing_purchase_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES clothing_purchase_returns(id) ON DELETE CASCADE,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES clothing_variants(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK(quantity > 0),
  unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
  total_amount REAL NOT NULL CHECK(total_amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS clothing_purchase_return_items_invoice_line_idx ON clothing_purchase_return_items(invoice_line_id);

CREATE TABLE IF NOT EXISTS clothing_stock_transfers (
  id TEXT PRIMARY KEY,
  source_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  target_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source_variant_id TEXT NOT NULL REFERENCES clothing_variants(id) ON DELETE RESTRICT,
  target_variant_id TEXT NOT NULL REFERENCES clothing_variants(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK(quantity > 0),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(source_store_id <> target_store_id)
);
CREATE INDEX IF NOT EXISTS clothing_stock_transfers_source_idx ON clothing_stock_transfers(source_store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clothing_stock_transfers_target_idx ON clothing_stock_transfers(target_store_id, created_at DESC);

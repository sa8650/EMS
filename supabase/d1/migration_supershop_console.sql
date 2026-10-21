-- EMS Supershop retail console, additive for existing Cloudflare D1 databases.
-- The only rebuilt table is stores, so the legacy shop_type CHECK can accept the
-- new canonical Supershop value. Existing rows, IDs, category values and children
-- are copied in-place; Pharmacy continues to keep its original legacy shop_type.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
CREATE TABLE stores__supershop (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES administrators(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT NOT NULL,
  phone2 TEXT,
  email TEXT,
  website TEXT,
  shop_code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'General Store',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','read_only')),
  low_stock_threshold REAL NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  shop_type TEXT NOT NULL DEFAULT 'electronics' CHECK(shop_type IN ('electronics','clothing','pharmacy','supershop')),
  business_type TEXT NOT NULL DEFAULT 'electronics' CHECK(business_type IN ('electronics','clothing','pharmacy','supershop'))
);
INSERT INTO stores__supershop(id,admin_id,name,address,phone,phone2,email,website,shop_code,category,status,low_stock_threshold,created_at,updated_at,shop_type,business_type)
SELECT id,admin_id,name,address,phone,phone2,email,website,shop_code,category,status,low_stock_threshold,created_at,updated_at,shop_type,
  CASE WHEN shop_type='supershop' THEN 'supershop' ELSE business_type END FROM stores;
DROP TABLE stores;
ALTER TABLE stores__supershop RENAME TO stores;
CREATE INDEX IF NOT EXISTS idx_stores_admin ON stores(admin_id);
COMMIT;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS supershop_products (
  inventory_item_id TEXT PRIMARY KEY REFERENCES inventory_items(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  barcode TEXT,brand TEXT,subcategory TEXT,description TEXT,
  default_supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  mrp_per_base REAL NOT NULL DEFAULT 0 CHECK(mrp_per_base>=0),
  tax_percent REAL NOT NULL DEFAULT 0 CHECK(tax_percent>=0),
  reorder_threshold REAL NOT NULL DEFAULT 5 CHECK(reorder_threshold>=0),
  average_cost_base REAL NOT NULL DEFAULT 0 CHECK(average_cost_base>=0),
  active INTEGER NOT NULL DEFAULT 1,created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,inventory_item_id)
);
CREATE INDEX IF NOT EXISTS supershop_products_store_active_idx ON supershop_products(store_id,active);
CREATE INDEX IF NOT EXISTS supershop_products_supplier_idx ON supershop_products(store_id,default_supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS supershop_products_barcode_uq ON supershop_products(store_id,lower(barcode)) WHERE barcode IS NOT NULL AND trim(barcode)<>'';

CREATE TABLE IF NOT EXISTS supershop_product_units (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES supershop_products(inventory_item_id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL,factor_to_base REAL NOT NULL CHECK(factor_to_base>0),
  allow_fractional INTEGER NOT NULL DEFAULT 0,can_purchase INTEGER NOT NULL DEFAULT 1,can_sell INTEGER NOT NULL DEFAULT 1,
  purchase_price REAL CHECK(purchase_price IS NULL OR purchase_price>=0),selling_price REAL CHECK(selling_price IS NULL OR selling_price>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inventory_item_id,unit_label)
);
CREATE INDEX IF NOT EXISTS supershop_units_store_product_idx ON supershop_product_units(store_id,inventory_item_id);

CREATE TABLE IF NOT EXISTS supershop_invoice_lines (
  invoice_line_id TEXT PRIMARY KEY REFERENCES invoice_lines(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  unit_label TEXT NOT NULL,unit_factor REAL NOT NULL CHECK(unit_factor>0),
  quantity_base REAL NOT NULL CHECK(quantity_base>0),free_quantity_base REAL NOT NULL DEFAULT 0 CHECK(free_quantity_base>=0),
  unit_cost_base REAL NOT NULL DEFAULT 0 CHECK(unit_cost_base>=0),mrp_per_base REAL NOT NULL DEFAULT 0 CHECK(mrp_per_base>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS supershop_invoice_lines_store_item_idx ON supershop_invoice_lines(store_id,inventory_item_id);

CREATE TABLE IF NOT EXISTS supershop_stock_movements (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','purchase','sale','adjustment','stock_count','return_restock','return_damaged','return_defective','supplier_return','exchange_in','exchange_out','waste','damage')),
  quantity_base REAL NOT NULL,stock_before REAL,stock_after REAL,unit_cost_base REAL NOT NULL DEFAULT 0,
  reference_type TEXT,reference_id TEXT,reason TEXT,idempotency_key TEXT,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS supershop_movements_store_date_idx ON supershop_stock_movements(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS supershop_movements_item_date_idx ON supershop_stock_movements(store_id,inventory_item_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS supershop_movements_idempotency_uq ON supershop_stock_movements(store_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS supershop_operations (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,operation_type TEXT NOT NULL,result_id TEXT,invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,operation_key)
);
CREATE INDEX IF NOT EXISTS supershop_operations_invoice_idx ON supershop_operations(store_id,invoice_id);

CREATE TABLE IF NOT EXISTS supershop_alerts (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
  title TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','resolved')),
  href TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,alert_key)
);
CREATE INDEX IF NOT EXISTS supershop_alerts_store_status_idx ON supershop_alerts(store_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS supershop_supplier_returns (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  purchase_invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,return_number TEXT NOT NULL,
  return_date TEXT NOT NULL DEFAULT (date('now')),total_return_amount REAL NOT NULL DEFAULT 0 CHECK(total_return_amount>=0),
  due_reduction REAL NOT NULL DEFAULT 0 CHECK(due_reduction>=0),supplier_credit REAL NOT NULL DEFAULT 0 CHECK(supplier_credit>=0),
  reason TEXT NOT NULL,notes TEXT,idempotency_key TEXT NOT NULL,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,return_number),UNIQUE(store_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS supershop_supplier_returns_invoice_idx ON supershop_supplier_returns(store_id,purchase_invoice_id,return_date DESC);

CREATE TABLE IF NOT EXISTS supershop_supplier_return_items (
  id TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES supershop_supplier_returns(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK(quantity>0),quantity_base REAL NOT NULL CHECK(quantity_base>0),
  free_quantity_base REAL NOT NULL DEFAULT 0 CHECK(free_quantity_base>=0),unit_label TEXT NOT NULL,
  unit_factor REAL NOT NULL CHECK(unit_factor>0),unit_cost_base REAL NOT NULL DEFAULT 0,total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS supershop_supplier_return_items_return_idx ON supershop_supplier_return_items(return_id);

CREATE TABLE IF NOT EXISTS supershop_exchange_lines (
  exchange_item_id TEXT PRIMARY KEY REFERENCES exchange_items(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  unit_label TEXT NOT NULL,unit_factor REAL NOT NULL CHECK(unit_factor>0),quantity_base REAL NOT NULL CHECK(quantity_base>0),
  unit_cost_base REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS supershop_exchange_lines_store_item_idx ON supershop_exchange_lines(store_id,inventory_item_id);

CREATE TABLE IF NOT EXISTS supershop_exchange_settlements (
  exchange_id TEXT PRIMARY KEY REFERENCES exchanges(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  due_reduction REAL NOT NULL DEFAULT 0 CHECK(due_reduction>=0),
  payment_received REAL NOT NULL DEFAULT 0 CHECK(payment_received>=0),
  refund_paid REAL NOT NULL DEFAULT 0 CHECK(refund_paid>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aggregate stock and partial/full return guards apply only to Supershop records.
CREATE TRIGGER IF NOT EXISTS supershop_stock_underflow_guard
BEFORE UPDATE OF total_stock ON inventory_items
WHEN NEW.total_stock<0 AND EXISTS(SELECT 1 FROM stores WHERE id=NEW.store_id AND business_type='supershop')
BEGIN SELECT RAISE(ABORT,'supershop_stock_underflow'); END;

CREATE TRIGGER IF NOT EXISTS supershop_return_quantity_guard
BEFORE INSERT ON return_items
WHEN EXISTS(SELECT 1 FROM supershop_invoice_lines sl WHERE sl.invoice_line_id=NEW.invoice_line_id AND sl.store_id=(SELECT store_id FROM returns WHERE id=NEW.return_id))
 AND COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.invoice_line_id=NEW.invoice_line_id AND r.store_id=(SELECT store_id FROM returns WHERE id=NEW.return_id)),0)
   + COALESCE((SELECT SUM(ei.quantity) FROM exchange_items ei JOIN exchanges e ON e.id=ei.exchange_id WHERE ei.invoice_line_id=NEW.invoice_line_id AND ei.item_type='returned' AND e.store_id=(SELECT store_id FROM returns WHERE id=NEW.return_id)),0)
   + NEW.quantity > COALESCE((SELECT il.quantity FROM invoice_lines il WHERE il.id=NEW.invoice_line_id),0)+0.0001
BEGIN SELECT RAISE(ABORT,'supershop_return_quantity_exceeded'); END;

CREATE TRIGGER IF NOT EXISTS supershop_exchange_quantity_guard
BEFORE INSERT ON exchange_items WHEN NEW.item_type='returned'
 AND EXISTS(SELECT 1 FROM supershop_invoice_lines sl WHERE sl.invoice_line_id=NEW.invoice_line_id AND sl.store_id=(SELECT store_id FROM exchanges WHERE id=NEW.exchange_id))
 AND COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.invoice_line_id=NEW.invoice_line_id AND r.store_id=(SELECT store_id FROM exchanges WHERE id=NEW.exchange_id)),0)
   + COALESCE((SELECT SUM(ei.quantity) FROM exchange_items ei JOIN exchanges e ON e.id=ei.exchange_id WHERE ei.invoice_line_id=NEW.invoice_line_id AND ei.item_type='returned' AND e.store_id=(SELECT store_id FROM exchanges WHERE id=NEW.exchange_id)),0)
   + NEW.quantity > COALESCE((SELECT il.quantity FROM invoice_lines il WHERE il.id=NEW.invoice_line_id),0)+0.0001
BEGIN SELECT RAISE(ABORT,'supershop_return_quantity_exceeded'); END;

CREATE TRIGGER IF NOT EXISTS supershop_supplier_return_quantity_guard
BEFORE INSERT ON supershop_supplier_return_items
WHEN COALESCE((SELECT SUM(ri.quantity_base) FROM supershop_supplier_return_items ri JOIN supershop_supplier_returns rr ON rr.id=ri.return_id WHERE ri.invoice_line_id=NEW.invoice_line_id AND rr.store_id=NEW.store_id),0)+NEW.quantity_base
   > COALESCE((SELECT sl.quantity_base FROM supershop_invoice_lines sl WHERE sl.invoice_line_id=NEW.invoice_line_id AND sl.store_id=NEW.store_id),0)+0.0001
BEGIN SELECT RAISE(ABORT,'supershop_supplier_return_quantity_exceeded'); END;

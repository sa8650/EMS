-- EMS Pharmacy Console additive migration for Cloudflare D1.
-- Preserves the legacy shop_type CHECK by introducing business_type as the
-- canonical three-value field. Existing stores are backfilled; category is untouched.
ALTER TABLE stores ADD COLUMN business_type TEXT NOT NULL DEFAULT 'electronics'
  CHECK(business_type IN ('electronics','clothing','pharmacy'));
UPDATE stores SET business_type=shop_type;

CREATE TABLE IF NOT EXISTS pharmacy_settings (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  expiry_warning_days INTEGER NOT NULL DEFAULT 90 CHECK(expiry_warning_days BETWEEN 1 AND 730),
  low_stock_default REAL NOT NULL DEFAULT 5 CHECK(low_stock_default>=0),
  categories TEXT NOT NULL DEFAULT '["Prescription","OTC","Medical devices","Hygiene","Healthcare supplies"]',
  updated_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pharmacy_shelves (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,label TEXT NOT NULL,
  aisle TEXT,rack TEXT,shelf TEXT,bin TEXT,notes TEXT,active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,label)
);
CREATE INDEX IF NOT EXISTS pharmacy_shelves_store_active_idx ON pharmacy_shelves(store_id,active,label);
CREATE TABLE IF NOT EXISTS pharmacy_products (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL UNIQUE REFERENCES inventory_items(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,generic_name TEXT,brand TEXT,strength TEXT,dosage_form TEXT NOT NULL DEFAULT 'other',category TEXT NOT NULL DEFAULT 'Medicine',
  manufacturer TEXT,supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,barcode TEXT,base_unit TEXT NOT NULL DEFAULT 'tablet',
  purchase_price REAL NOT NULL DEFAULT 0 CHECK(purchase_price>=0),sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price>=0),
  reorder_threshold REAL NOT NULL DEFAULT 5 CHECK(reorder_threshold>=0),default_location_id TEXT REFERENCES pharmacy_shelves(id) ON DELETE SET NULL,
  prescription_required INTEGER NOT NULL DEFAULT 0,tracks_batch INTEGER NOT NULL DEFAULT 1,tracks_expiry INTEGER NOT NULL DEFAULT 1,
  description TEXT,active INTEGER NOT NULL DEFAULT 1,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,barcode)
);
CREATE INDEX IF NOT EXISTS pharmacy_products_store_idx ON pharmacy_products(store_id,active);
CREATE INDEX IF NOT EXISTS pharmacy_products_supplier_idx ON pharmacy_products(store_id,supplier_id);
CREATE TABLE IF NOT EXISTS pharmacy_product_units (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE CASCADE,unit_label TEXT NOT NULL,
  factor_to_base REAL NOT NULL CHECK(factor_to_base>0),allow_fractional INTEGER NOT NULL DEFAULT 0,
  can_purchase INTEGER NOT NULL DEFAULT 0,can_sell INTEGER NOT NULL DEFAULT 1,
  purchase_price REAL CHECK(purchase_price IS NULL OR purchase_price>=0),selling_price REAL CHECK(selling_price IS NULL OR selling_price>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(product_id,unit_label)
);
CREATE INDEX IF NOT EXISTS pharmacy_product_units_store_product_idx ON pharmacy_product_units(store_id,product_id);
CREATE TABLE IF NOT EXISTS pharmacy_batches (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,batch_number TEXT,
  manufacturing_date TEXT,expiry_date TEXT,quantity_on_hand_base REAL NOT NULL DEFAULT 0 CHECK(quantity_on_hand_base>=0),
  free_quantity_base REAL NOT NULL DEFAULT 0 CHECK(free_quantity_base>=0),unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
  mrp_per_base REAL NOT NULL DEFAULT 0 CHECK(mrp_per_base>=0),status TEXT NOT NULL DEFAULT 'available'
    CHECK(status IN ('available','quarantined','blocked','recalled','expired')),
  location_id TEXT REFERENCES pharmacy_shelves(id) ON DELETE SET NULL,supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,purchase_invoice_line_id TEXT REFERENCES invoice_lines(id) ON DELETE SET NULL,
  created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pharmacy_batches_fefo_idx ON pharmacy_batches(store_id,product_id,status,expiry_date,created_at);
CREATE INDEX IF NOT EXISTS pharmacy_batches_expiry_idx ON pharmacy_batches(store_id,expiry_date) WHERE quantity_on_hand_base>0;
CREATE INDEX IF NOT EXISTS pharmacy_batches_location_idx ON pharmacy_batches(store_id,location_id);
CREATE INDEX IF NOT EXISTS pharmacy_batches_purchase_idx ON pharmacy_batches(purchase_invoice_id,purchase_invoice_line_id);
CREATE TABLE IF NOT EXISTS pharmacy_invoice_lines (
  invoice_line_id TEXT PRIMARY KEY REFERENCES invoice_lines(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,
  unit_label TEXT NOT NULL,unit_factor REAL NOT NULL CHECK(unit_factor>0),quantity_base REAL NOT NULL CHECK(quantity_base>0),
  free_quantity_base REAL NOT NULL DEFAULT 0 CHECK(free_quantity_base>=0),unit_cost_base REAL NOT NULL DEFAULT 0,mrp_per_base REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pharmacy_invoice_batches (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
  movement_kind TEXT NOT NULL CHECK(movement_kind IN ('purchase','sale','return')),quantity_base REAL NOT NULL CHECK(quantity_base>0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(invoice_line_id,batch_id,movement_kind)
);
CREATE INDEX IF NOT EXISTS pharmacy_invoice_batches_batch_idx ON pharmacy_invoice_batches(batch_id,created_at);
CREATE TABLE IF NOT EXISTS pharmacy_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,batch_id TEXT REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,quantity_base REAL NOT NULL CHECK(quantity_base>0),stock_before REAL NOT NULL DEFAULT 0,stock_after REAL NOT NULL DEFAULT 0,
  from_location_id TEXT REFERENCES pharmacy_shelves(id) ON DELETE SET NULL,to_location_id TEXT REFERENCES pharmacy_shelves(id) ON DELETE SET NULL,
  reference_type TEXT,reference_id TEXT,reason TEXT,idempotency_key TEXT UNIQUE,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pharmacy_stock_movements_product_idx ON pharmacy_stock_movements(store_id,product_id,created_at DESC);
CREATE INDEX IF NOT EXISTS pharmacy_stock_movements_batch_idx ON pharmacy_stock_movements(batch_id,created_at DESC);
CREATE TABLE IF NOT EXISTS pharmacy_operations (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,operation_key TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('sale','purchase','return','exchange','supplier_return','move')),
  invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,result_id TEXT,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,operation_key)
);
CREATE TABLE IF NOT EXISTS pharmacy_alerts (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,alert_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),title TEXT NOT NULL,detail TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT 'pharmacy-dashboard',status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','resolved')),
  read_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,alert_key)
);
CREATE INDEX IF NOT EXISTS pharmacy_alerts_store_status_idx ON pharmacy_alerts(store_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS pharmacy_returns (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,return_number TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT 'Walk-in customer',return_date TEXT NOT NULL DEFAULT (date('now')),
  return_type TEXT NOT NULL DEFAULT 'return' CHECK(return_type IN ('return','exchange')),
  amount REAL NOT NULL DEFAULT 0 CHECK(amount>=0),refund_method TEXT NOT NULL DEFAULT 'none',
  disposition TEXT NOT NULL DEFAULT 'quarantined',reason TEXT NOT NULL,notes TEXT,idempotency_key TEXT NOT NULL,
  created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,return_number),UNIQUE(store_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pharmacy_returns_invoice_idx ON pharmacy_returns(store_id,invoice_id,created_at DESC);
CREATE TABLE IF NOT EXISTS pharmacy_return_items (
  id TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES pharmacy_returns(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,batch_id TEXT REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
  quantity_base REAL NOT NULL CHECK(quantity_base>0),condition TEXT NOT NULL CHECK(condition IN ('sellable','quarantined','damaged','recalled','expired')),
  reason TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0 CHECK(amount>=0),restocked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pharmacy_return_items_invoice_line_idx ON pharmacy_return_items(invoice_line_id);
CREATE TABLE IF NOT EXISTS pharmacy_supplier_returns (
  id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  purchase_invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,batch_id TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,return_number TEXT NOT NULL,
  quantity_base REAL NOT NULL CHECK(quantity_base>0),amount REAL NOT NULL CHECK(amount>=0),reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,created_by TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,return_number),UNIQUE(store_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pharmacy_supplier_returns_purchase_idx ON pharmacy_supplier_returns(store_id,purchase_invoice_id,created_at DESC);

-- Safety rails for D1's transactional API emulation.
CREATE TRIGGER IF NOT EXISTS pharmacy_batch_stock_guard
BEFORE UPDATE OF quantity_on_hand_base ON pharmacy_batches
WHEN NEW.quantity_on_hand_base<0
BEGIN SELECT RAISE(ABORT,'pharmacy_batch_stock_underflow'); END;
CREATE TABLE IF NOT EXISTS pharmacy_sale_claims (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,batch_id TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,PRIMARY KEY(store_id,batch_id,operation_key)
);
CREATE TRIGGER IF NOT EXISTS pharmacy_sale_eligible_guard
BEFORE UPDATE OF quantity_on_hand_base ON pharmacy_batches
WHEN NEW.quantity_on_hand_base<OLD.quantity_on_hand_base
  AND EXISTS(SELECT 1 FROM pharmacy_sale_claims c WHERE c.store_id=OLD.store_id AND c.batch_id=OLD.id)
  AND (OLD.status<>'available' OR (OLD.expiry_date IS NOT NULL AND date(OLD.expiry_date)<date('now')))
BEGIN SELECT RAISE(ABORT,'pharmacy_batch_not_sellable'); END;
CREATE TRIGGER IF NOT EXISTS pharmacy_inventory_stock_guard
BEFORE UPDATE OF total_stock ON inventory_items
WHEN NEW.total_stock<0 AND EXISTS(SELECT 1 FROM pharmacy_products p WHERE p.inventory_item_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'pharmacy_stock_underflow'); END;

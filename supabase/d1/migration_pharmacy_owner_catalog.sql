-- Apply once after migration_pharmacy_catalog_details.sql.
CREATE TABLE IF NOT EXISTS pharmacy_master_manufacturers (
  id TEXT PRIMARY KEY,name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_master_manufacturers_name_idx ON pharmacy_master_manufacturers(name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS pharmacy_master_products (
  id TEXT PRIMARY KEY,name TEXT NOT NULL,generic_name TEXT,strength TEXT,dosage_form TEXT NOT NULL DEFAULT 'other',
  manufacturer TEXT,category TEXT NOT NULL DEFAULT 'Medicine',pack_size TEXT,
  barcode TEXT,sku TEXT,base_unit TEXT NOT NULL DEFAULT 'tablet',
  purchase_price REAL NOT NULL DEFAULT 0 CHECK(purchase_price>=0),sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price>=0),
  wholesale_price REAL NOT NULL DEFAULT 0 CHECK(wholesale_price>=0),reorder_threshold REAL NOT NULL DEFAULT 5 CHECK(reorder_threshold>=0),
  units TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_master_products_sku_idx ON pharmacy_master_products(sku COLLATE NOCASE) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_master_products_barcode_idx ON pharmacy_master_products(barcode) WHERE barcode IS NOT NULL;

-- Apply once on existing D1 Pharmacy databases after migration_pharmacy_aggregate_stock.sql.
ALTER TABLE pharmacy_products ADD COLUMN pack_size TEXT;
ALTER TABLE pharmacy_products ADD COLUMN wholesale_price REAL NOT NULL DEFAULT 0 CHECK(wholesale_price>=0);
CREATE TABLE IF NOT EXISTS pharmacy_manufacturers (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL, created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_manufacturers_store_name_idx ON pharmacy_manufacturers(store_id,name COLLATE NOCASE);
UPDATE pharmacy_products SET manufacturer=trim(brand) WHERE (manufacturer IS NULL OR trim(manufacturer)='') AND brand IS NOT NULL AND trim(brand)<>'';
INSERT OR IGNORE INTO pharmacy_manufacturers(id,store_id,name)
  SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),store_id,trim(manufacturer)
  FROM pharmacy_products WHERE manufacturer IS NOT NULL AND trim(manufacturer)<>'' GROUP BY store_id,lower(trim(manufacturer));

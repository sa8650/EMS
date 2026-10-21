-- Apply once AFTER migration_pharmacy_supplier_return.sql on existing D1 shops.
-- Quarantined customer-returned units stay outside saleable inventory.
ALTER TABLE pharmacy_supplier_return_lines ADD COLUMN quarantine_item_id TEXT REFERENCES pharmacy_return_items(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS pharmacy_supplier_return_lines_quarantine_idx ON pharmacy_supplier_return_lines(store_id,quarantine_item_id);
CREATE TRIGGER IF NOT EXISTS pharmacy_supplier_return_quarantine_guard BEFORE INSERT ON pharmacy_supplier_return_lines
WHEN NEW.quarantine_item_id IS NOT NULL AND (
 NOT EXISTS(SELECT 1 FROM pharmacy_return_items q WHERE q.id=NEW.quarantine_item_id AND q.store_id=NEW.store_id AND q.product_id=NEW.product_id AND q.restocked=0 AND q.condition IN ('damaged','defective','expired','quarantined','recalled'))
 OR NEW.quantity_base+COALESCE((SELECT SUM(l.quantity_base) FROM pharmacy_supplier_return_lines l WHERE l.store_id=NEW.store_id AND l.quarantine_item_id=NEW.quarantine_item_id),0) > COALESCE((SELECT q.quantity_base FROM pharmacy_return_items q WHERE q.id=NEW.quarantine_item_id AND q.store_id=NEW.store_id),0)+0.000001
) BEGIN SELECT RAISE(ABORT,'pharmacy_supplier_return_quarantine_exceeded'); END;

-- Pharmacy return inspection/release. Additive and safe for existing D1 shops.
ALTER TABLE pharmacy_return_items ADD COLUMN package_sealed INTEGER NOT NULL DEFAULT 0 CHECK(package_sealed IN (0,1));
ALTER TABLE pharmacy_return_items ADD COLUMN inspection_notes TEXT;
ALTER TABLE pharmacy_return_items ADD COLUMN inspected_by TEXT;
ALTER TABLE pharmacy_return_items ADD COLUMN inspected_at TEXT;

CREATE TABLE IF NOT EXISTS pharmacy_restock_claims (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  return_item_id TEXT NOT NULL REFERENCES pharmacy_return_items(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
  PRIMARY KEY(store_id,return_item_id)
);
CREATE TRIGGER IF NOT EXISTS pharmacy_return_restock_eligible_guard
BEFORE UPDATE OF quantity_on_hand_base ON pharmacy_batches
WHEN NEW.quantity_on_hand_base>OLD.quantity_on_hand_base
  AND EXISTS(SELECT 1 FROM pharmacy_restock_claims c WHERE c.store_id=OLD.store_id AND c.batch_id=OLD.id)
  AND (OLD.status<>'available' OR (OLD.expiry_date IS NOT NULL AND date(OLD.expiry_date)<date('now')))
BEGIN SELECT RAISE(ABORT,'pharmacy_return_batch_not_sellable'); END;

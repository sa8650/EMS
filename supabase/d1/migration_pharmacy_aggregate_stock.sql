-- Pharmacy aggregate-stock model. Batch rows are kept as legacy history; new stock is aggregate.
ALTER TABLE pharmacy_products ADD COLUMN average_cost_base REAL NOT NULL DEFAULT 0 CHECK(average_cost_base>=0);

UPDATE pharmacy_products
SET average_cost_base=COALESCE(
  (SELECT ROUND(SUM(b.quantity_on_hand_base*b.unit_cost)/NULLIF(SUM(b.quantity_on_hand_base),0),6)
   FROM pharmacy_batches b WHERE b.store_id=pharmacy_products.store_id AND b.product_id=pharmacy_products.id AND b.quantity_on_hand_base>0),
  purchase_price,0
);
UPDATE pharmacy_products SET tracks_batch=0,tracks_expiry=0;

-- Aggregate stock writes still respect the shared inventory stock-underflow guard.

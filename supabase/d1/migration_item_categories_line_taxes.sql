-- Round 3 (D1 flavour): inventory item categories + per-invoice-line VAT/discount.
-- Run on your Cloudflare D1 database after migration_due_recovery_payment.sql.

alter table inventory_items add column category text;

alter table invoice_lines add column tax_percent numeric(7,3) not null default 0;
alter table invoice_lines add column discount numeric(14,2) not null default 0;

alter table invoices add column line_tax_amount numeric(14,2) not null default 0;
alter table invoices add column line_discount_amount numeric(14,2) not null default 0;

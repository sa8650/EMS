# Supabase consolidated baseline

`001_ems_complete_schema.sql` is the one-file Supabase baseline for **new databases**. It contains the complete EMS schema, CShop, PShop, current entitlement routines, legacy Pharmacy batch/return tables for historical compatibility, and the aggregate-stock / weighted-average-cost Pharmacy routines from migration `051`.

Do not apply this baseline on top of an existing database that has already run the incremental migration history. Existing deployments should keep using only their outstanding migrations in order. For Pharmacy upgrades, apply `047_clothing_business_console.sql`, `048_pharmacy_console.sql`, `049_pharmacy_return_intake.sql`, `050_pharmacy_sealed_restock.sql`, then `051_pharmacy_aggregate_stock.sql` once each and in order.

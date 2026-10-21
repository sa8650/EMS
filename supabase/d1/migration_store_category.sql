-- Cloudflare D1 migration: Add category column to stores table
ALTER TABLE stores ADD COLUMN category TEXT NOT NULL DEFAULT 'General Store';

-- ============================================================================
-- EMS V1 · Premium Add-Ons fix — Supabase migration
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is idempotent (safe to run more than once).
-- ============================================================================

-- 1) New columns on addon_purchases so a coupon discount can be recorded.
--    (Only needed if they don't exist yet.)
ALTER TABLE public.addon_purchases
  ADD COLUMN IF NOT EXISTS coupon_code     text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 1b) Premium add-on card image (PNG URL set in each card's Setup modal).
--     NULL/empty shows the default large icon instead.
ALTER TABLE public.addon_settings
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Make sure the three add-ons have a display title.
--    The admin card / cart / checkout previously showed a blank name when
--    `title` was NULL. This seeds a sensible title if it is missing.
UPDATE public.addon_settings
   SET title = 'ConnectX'
 WHERE addon_key = 'connectx'
   AND (title IS NULL OR title = '');

UPDATE public.addon_settings
   SET title = 'Zudo AI'
 WHERE addon_key = 'zudo'
   AND (title IS NULL OR title = '');

UPDATE public.addon_settings
   SET title = 'AI Business Health'
 WHERE addon_key = 'business_health'
   AND (title IS NULL OR title = '');

-- 3) (Optional, only if the addon_settings rows are missing entirely.)
--    Adjust the column list if your table differs, then uncomment:
--
-- INSERT INTO public.addon_settings
--   (addon_key, title, details, enabled, unit_price, min_days, max_days,
--    min_daily_limit, max_daily_limit)
-- VALUES
--   ('connectx',        'ConnectX',          'Send business emails through EMS.', false, 2, 7,  365, 10, 500),
--   ('zudo',            'Zudo AI',           'Read-only AI assistant for your shop.', false, 2, 7, 365, 10, 500),
--   ('business_health', 'AI Business Health','Business-health reports from your data.', false, 2, 7, 365, 1, 50)
-- ON CONFLICT (addon_key) DO NOTHING;

-- ============================================================================
-- Notes
-- ============================================================================
-- * `addon_coupons` (code, percent_off, active, created_at) and
--   `addon_checkout_settings` (id, payment_info, updated_by, updated_at)
--   are assumed to already exist — they are written by the existing
--   "Payment & coupon setup" screen.
-- * After deploying the updated Cloudflare Function, the new fields
--   (coupon_code, discount_amount) are written automatically on checkout.
-- ============================================================================

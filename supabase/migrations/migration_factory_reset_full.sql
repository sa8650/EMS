-- ============================================================================
-- EMS V1 · Full Factory Reset — migration
-- Replaces factory_reset_ems so it wipes EVERY data table (including the newer
-- TrueBill, HelpDesk, add-ons, Zudo, Business Health, ConnectX, CMS, etc.) and
-- re-seeds the essential defaults.
-- Run in Supabase SQL editor. Idempotent.
-- ============================================================================

create or replace function public.factory_reset_ems()
returns void language plpgsql security definer set search_path=public as $$
begin
  truncate table
    -- core business data
    public.invoice_lines,
    public.invoices,
    public.inventory_items,
    public.expenses,
    public.attendance,
    public.due_recoveries,
    public.suppliers,
    public.customers,
    public.staff,
    public.stores,
    public.device_logins,
    public.activity_logs,
    public.error_logs,
    -- licensing / entitlements
    public.current_entitlements,
    public.licenses,
    public.license_plans,
    -- administrators & owner
    public.administrators,
    public.ems_owners,
    -- platform / owner content
    public.platform_activity_logs,
    public.platform_settings,
    public.public_pages,
    public.blog_posts,
    public.contact_messages,
    -- ConnectX
    public.connectx_messages,
    public.connectx_settings,
    -- Zudo
    public.zudo_messages,
    public.zudo_conversations,
    public.zudo_settings,
    -- Business AI Health
    public.business_health_reports,
    public.business_health_settings,
    -- Premium Add-Ons
    public.addon_purchases,
    public.addon_settings,
    public.addon_checkout_settings,
    public.addon_coupons,
    -- TrueBill
    public.truebill_scans,
    -- HelpDesk
    public.helpdesk_messages
  restart identity cascade;

  -- Re-seed essential defaults
  insert into public.platform_settings(setting_key,setting_value)
  values ('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1","public_base_url":""}'::jsonb);

  insert into public.addon_checkout_settings(id) values (true) on conflict(id) do nothing;

  insert into public.addon_settings
    (addon_key, title, details, unit_price, min_days, max_days, min_daily_limit, max_daily_limit)
  values
    ('connectx','ConnectX','Send business emails through EMS.',2,7,365,10,500),
    ('zudo','Zudo AI','Read-only AI assistant for your shop.',2,7,365,10,500),
    ('business_health','AI Business Health','Business-health reports from your data.',2,7,365,1,50),
    ('truebill','TrueBill','Put a scannable QR code on every invoice so customers can verify authenticity.',2,30,365,1,1)
  on conflict(addon_key) do nothing;
end $$;

revoke all on function public.factory_reset_ems() from public;

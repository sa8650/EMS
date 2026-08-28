-- Factory reset correction: delete public Contact messages too.
-- Run once in Supabase SQL Editor after the existing EMS migrations.
create or replace function public.factory_reset_ems()
returns void language plpgsql security definer set search_path=public as $$
begin
 truncate table public.platform_activity_logs,public.platform_settings,public.connectx_messages,
   public.connectx_settings,public.due_recoveries,public.business_health_reports,
   public.business_health_settings,public.current_entitlements,public.licenses,
   public.license_plans,public.administrators,public.ems_owners restart identity cascade;
 delete from public.contact_messages;
 insert into public.platform_settings(setting_key,setting_value)
 values ('branding','{"product_name":"EMS V1","powered_by":"DoxTox","website_name":"EMS V1","public_base_url":""}'::jsonb);
end $$;
revoke all on function public.factory_reset_ems() from public;

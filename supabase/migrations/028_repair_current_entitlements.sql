-- One-time repair for licenses that are active but were not copied to current_entitlements.
-- Safe to run more than once. It selects the longest-valid active license per administrator,
-- reapplies capacity/features, and restores shops allowed by that license to Active.
do $$
declare r record;
begin
 for r in
  select distinct on (admin_id) id
  from public.licenses
  where status='active' and starts_at <= now() and expires_at > now()
  order by admin_id, expires_at desc, created_at desc
 loop
  perform public.apply_current_entitlement(r.id);
 end loop;
end $$;

-- Verification: each active administrator should show a current license and capacity.
select ce.admin_id, ce.current_license_id, ce.shop_limit, ce.business_health_enabled,
       ce.business_health_daily_limit, ce.status, ce.starts_at, ce.expires_at
from public.current_entitlements ce
order by ce.updated_at desc;

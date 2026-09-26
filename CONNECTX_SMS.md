# ConnectX SMS subsystem (EMS)

**ConnectX: Central Communication Gateway powered by Dexter Studio** now includes Android read-only outgoing EMS email history alongside this SMS dispatch subsystem. The Android **SMS page** contains SIM switching, selected-SIM manual balance and outgoing SMS activity; the **Email page** reads this shop's existing `connectx_messages`. For the new email device routes and release order, see [`APP_STORE_RELEASE.md`](APP_STORE_RELEASE.md). There is no new email database migration.

Android companion app lives in `/ConnectX`. SMS integration in this repo:

- `supabase/migrations/041_connectx_sms_gateway.sql`
- `supabase/d1/migration_connectx_gateway.sql`
- `functions/_lib/connectx_sms.js`
- `functions/api/[[path]].js` (route hook + fire-and-forget enqueue after sale / payment / return / exchange)
- `functions/_lib/db.js` (boolean/json columns + factory reset)
- `assets/js/app.js` (Settings → Communication)

Unrelated modules were not redesigned.

## Deploy

1. Run the SQL migration on Supabase (SQL editor) or D1.
2. Deploy Cloudflare Pages as usual.
3. Shop **Settings → Communication**: enable SMS, edit templates, revoke devices.

Sales complete even if no phone is online. Jobs remain **queued / pending** until ConnectX claims them.

# ConnectX SMS subsystem (EMS)

**ConnectX: Central Communication Gateway powered by Dexter Studio** dispatches
queued shop SMS through a physical SIM and can read the shop's outgoing EMS
email history (read-only).

> **Connection model (current):** SMS dispatch is automated by the
> **ConnectX central service**, which connects to EMS **only** through the
> **EMS Public API** (`/api/v1/*`) using a **platform API key** issued by the
> EMS owner (Owner Console → **EMS API**) with granular scopes (`sms:read`,
> `sms:write`). One platform-wide key covers **every shop** — the service
> claims queued SMS fleet-wide. The old device-token pairing (administrator
> password login on the phone) has been **removed**; its endpoints return
> `410 Gone`. Administrators never manage keys — they only enable SMS per
> shop. Email is unrelated: EMS sends it directly via Brevo. See
> [`API.md`](API.md) and `ConnectX/CONNECTX_API_MIGRATION.md`.

SMS integration in this repo:

- `supabase/migrations/041_connectx_sms_gateway.sql` — SMS queue + per-shop settings
- `supabase/migrations/045_public_api_credentials.sql` — API keys, drops device pairing
- `supabase/d1/migration_connectx_sms.sql`, `supabase/d1/migration_public_api_credentials.sql` — D1 versions
- `functions/_lib/connectx_sms.js` — settings, templates, queue, auto-SMS enqueue
- `functions/_lib/public_api.js` — API-key auth + `/api/v1/sms/*` gateway endpoints
- `functions/api/[[path]].js` — route hook + fire-and-forget enqueue after sale / payment / return / exchange
- `functions/_lib/db.js` — boolean/json columns + factory reset
- `assets/js/app.js` — Owner Console → **EMS API** (credentials); Admin console → ConnectX (per-shop toggles + gateway status); Shop → Settings → Communication

Unrelated modules were not redesigned.

## How dispatch works

1. EMS queues an SMS (automatic trigger or manual send) into
   `connectx_sms_messages` with status `queued`.
2. The ConnectX central service (API key with `sms:write`) polls
   `POST /api/v1/sms/claim` — **fleet-wide across all shops** — claimed jobs
   flip to `sending` and record the claiming API key id in `device_id`; each
   claimed job carries its `shop_id`.
3. The service delivers the SMS and calls `POST /api/v1/sms/report`
   (`sent` / `failed`). Stale `sending` jobs are auto-requeued after 10 minutes.

Sales complete even if the service is offline. Jobs remain **queued / pending**
until claimed.

## Deploy

1. Run `045_public_api_credentials.sql` on Supabase (SQL editor) — or
   `supabase/d1/migration_public_api_credentials.sql` on D1.
2. Deploy Cloudflare Pages as usual.
3. Owner Console → **EMS API**: create a platform key with `sms:read` +
   `sms:write` and paste it into the ConnectX central service configuration.
4. Shop **Settings → Communication**: enable SMS and edit templates.
   Admin console → **ConnectX**: per-shop gateway toggles + read-only gateway
   status (admins never see API keys).

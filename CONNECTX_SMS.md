# ConnectX SMS subsystem (EMS)

**ConnectX: Central Communication Gateway powered by Dexter Studio** dispatches
queued shop SMS through a physical SIM and can read the shop's outgoing EMS
email history (read-only).

> **Connection model (current):** the ConnectX Android app — like every
> external application — connects to EMS **only** through the **EMS Public API**
> (`/api/v1/*`) using an **API key** with granular scopes (`sms:read`,
> `sms:write`, optionally `emails:read`). The old device-token pairing
> (administrator password login on the phone) has been **removed**; its
> endpoints return `410 Gone`. See [`API.md`](API.md) for the full reference
> and `ConnectX/CONNECTX_API_MIGRATION.md` for the old→new endpoint mapping.

SMS integration in this repo:

- `supabase/migrations/041_connectx_sms_gateway.sql` — SMS queue + per-shop settings
- `supabase/migrations/045_public_api_credentials.sql` — API keys, drops device pairing
- `supabase/d1/migration_connectx_sms.sql`, `supabase/d1/migration_public_api_credentials.sql` — D1 versions
- `functions/_lib/connectx_sms.js` — settings, templates, queue, auto-SMS enqueue
- `functions/_lib/public_api.js` — API-key auth + `/api/v1/sms/*` gateway endpoints
- `functions/api/[[path]].js` — route hook + fire-and-forget enqueue after sale / payment / return / exchange
- `functions/_lib/db.js` — boolean/json columns + factory reset
- `assets/js/app.js` — Admin console → ConnectX & **API Access**; Shop → Settings → Communication

Unrelated modules were not redesigned.

## How dispatch works

1. EMS queues an SMS (automatic trigger or manual send) into
   `connectx_sms_messages` with status `queued`.
2. An API client with `sms:write` (the ConnectX app) polls
   `POST /api/v1/sms/claim` — claimed jobs flip to `sending` and record the
   claiming API key id in `device_id`.
3. The client transmits via its SIM and calls `POST /api/v1/sms/report`
   (`sent` / `failed`). Stale `sending` jobs are auto-requeued after 10 minutes.

Sales complete even if no client is online. Jobs remain **queued / pending**
until an API client claims them.

## Deploy

1. Run `045_public_api_credentials.sql` on Supabase (SQL editor) — or
   `supabase/d1/migration_public_api_credentials.sql` on D1.
2. Deploy Cloudflare Pages as usual.
3. Admin console → **API Access**: create a key with `sms:read` + `sms:write`
   and paste it into the ConnectX app.
4. Shop **Settings → Communication**: enable SMS and edit templates.
   Admin console → **ConnectX**: per-shop gateway toggles and API client status.

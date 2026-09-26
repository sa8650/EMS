# EMS Public API (v1)

The EMS Public API is the **only** way external applications connect to EMS.
This includes the **ConnectX Android SMS Gateway app**, POS terminals, and any
custom integration you build.

Design rules:

1. **API-key authentication** — no administrator passwords, no session logins,
   no device tokens. A key is created in the EMS admin console and can be
   revoked at any time.
2. **Granular permissions** — every key carries scopes (`read`, `write`, or
   per-resource such as `sms:write`). A request without the required scope is
   rejected with `403 insufficient_scope`.
3. **No database access** — external apps never see Supabase, D1, or any
   database credential. Every response is a whitelisted JSON shape produced by
   the EMS API layer.
4. **Migration-safe contract** — EMS can move from Supabase to Cloudflare D1 or
   a dedicated server without changing a single `/api/v1` endpoint. Integrate
   against this document, not against the storage backend.

---

## 1. Getting credentials

1. Sign in to EMS as an **Administrator**.
2. Open **API Access** in the console navigation.
3. Click **Create API Key**, choose:
   - a **name** (e.g. `ConnectX — Counter Phone 1`),
   - a **shop scope** — lock the key to one shop, or leave it
     administrator-wide,
   - **scopes** (see §3),
   - an optional **expiry** in days.
4. Copy the key immediately — it is displayed **once**. EMS stores only a
   SHA-256 hash of it.

Key format: `emsk_` followed by 64 hex characters. The list view shows only the
prefix (e.g. `emsk_a1b2c3d4…`).

Limits: up to **25 active keys** per administrator. Revoked keys stop working
instantly.

## 2. Authentication

Send the key on every request, either way:

```
Authorization: Bearer emsk_xxxxxxxx…        (preferred)
X-API-Key: emsk_xxxxxxxx…
```

Base URL:

```
https://<your-ems-domain>/api/v1
```

Errors are JSON: `{ "error": "message", "code": "machine_code" }` with proper
HTTP status codes (`401` bad/revoked/expired key, `403` missing scope or
inactive account, `404` not found, `409` conflict, `429` daily limit reached,
`410` retired legacy endpoint).

CORS is enabled (`*`) on all `/api/v1` routes, so browser-based integrations
work too.

### Shop selection

- A key **locked to a shop** always operates on that shop.
- An **administrator-wide** key must select a shop for shop-scoped endpoints:
  query `?shop_id=<uuid>` or header `X-Shop-Id: <uuid>`.

## 3. Scopes

| Scope | Grants |
|---|---|
| `read` | Read access to **every** resource |
| `write` | Write access to **every** writable resource |
| `shops:read` | Shop profiles |
| `customers:read` / `suppliers:read` / `staff:read` | Contact lists |
| `inventory:read` | Inventory items and stock |
| `invoices:read` | Sales/purchase invoices with line items |
| `emails:read` | Outgoing ConnectX email history (read-only) |
| `sms:read` | SMS queue, history, stats, settings, SIM-carrier lookup |
| `sms:write` | Claim, dispatch, report, cancel, and queue SMS |

Recommended for the **ConnectX Android app**: `sms:read` + `sms:write`
(optionally `emails:read` for the email history page).

## 4. Endpoints

All endpoints return JSON. `limit` query parameters are capped server-side.

### 4.1 Identity & connection

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/v1` | none | API metadata + scope list (no auth needed) |
| GET | `/v1/ping` | any | Validates the key; returns name, scopes, expiry |
| GET | `/v1/me` | any | Key info, administrator profile, accessible shops |
| POST | `/v1/heartbeat` | any | Shop summary + `smsEnabled`; marks the client **Online** in the console |

### 4.2 Shops

| Method | Path | Scope |
|---|---|---|
| GET | `/v1/shops` | `shops:read` |
| GET | `/v1/shops/:id` | `shops:read` |

### 4.3 Contacts, inventory, invoices (read-only)

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/customers?shop_id=…&limit=100` | `customers:read` | |
| GET | `/v1/suppliers?shop_id=…` | `suppliers:read` | |
| GET | `/v1/staff?shop_id=…` | `staff:read` | |
| GET | `/v1/inventory?shop_id=…` | `inventory:read` | |
| GET | `/v1/invoices?shop_id=…&kind=sale` | `invoices:read` | `kind` = `sale` \| `purchase` |
| GET | `/v1/invoices/:id?shop_id=…` | `invoices:read` | includes line items |

### 4.4 ConnectX email history (read-only)

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/emails?shop_id=…&page=0` | `emails:read` | 30 per page, `hasMore` flag |
| GET | `/v1/emails/stats?utcOffsetMinutes=360` | `emails:read` | today's sent/failed/pending |
| GET | `/v1/emails/:id` | `emails:read` | full body (whitelisted fields) |

Email **sending** stays inside EMS — the API never exposes provider
credentials.

### 4.5 SMS gateway (how the ConnectX app dispatches)

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/v1/sms/settings` | `sms:read` | shop SMS enabled + auto-trigger flags |
| GET | `/v1/sms/queue` | `sms:read` | queued jobs (oldest first) |
| GET | `/v1/sms/messages?range=today\|7d\|30d` | `sms:read` | history (≤250 rows) |
| GET | `/v1/sms/stats?utcOffsetMinutes=360` | `sms:read` | today's counters + last activity |
| POST | `/v1/sms/claim` | `sms:write` | atomically claim up to `{"limit":8}` queued jobs; stale `sending` jobs are auto-released after 10 min |
| POST | `/v1/sms/report` | `sms:write` | `{"jobId":"…","status":"sent"\|"failed","error":"…"}` |
| POST | `/v1/sms/cancel` | `sms:write` | `{"jobId":"…"}` — only while still queued |
| DELETE | `/v1/sms/jobs/:id` | `sms:write` | same as cancel |
| POST | `/v1/sms/send` | `sms:write` | queue a new SMS (see below) |
| GET | `/v1/sim-carrier?mccMnc=47001` | `sms:read` | owner-managed USSD balance-code lookup |

`POST /v1/sms/send` body:

```json
{
  "phone": "+8801XXXXXXXXX",
  "message": "Hi! Your order is ready.",
  "recipientName": "Customer name",
  "recipientType": "customer",
  "invoiceId": "uuid (optional)",
  "idempotencyKey": "unique-string (optional, prevents duplicates)"
}
```

Sending honours the shop's ConnectX entitlement and daily SMS limit
(`429` when exhausted) and the admin's per-shop SMS enable switch (`403`).

#### Gateway dispatch loop (reference implementation)

```
every 20–30 s:
  POST /v1/heartbeat                     → shows Online in EMS console
  POST /v1/sms/claim {"limit": 8}        → jobs[] (status flips to "sending")
  for each job: send via SIM, then
  POST /v1/sms/report {"jobId": id, "status": "sent" | "failed", "error": "…"}
```

Claiming is race-safe: a job is only returned to the client whose conditional
update actually captured it, so multiple gateways can poll the same shop.

## 5. Examples

```bash
# Verify a key
curl -H "Authorization: Bearer $EMS_KEY" https://your-ems.pages.dev/api/v1/ping

# List queued SMS for a shop (admin-wide key)
curl -H "Authorization: Bearer $EMS_KEY" \
  "https://your-ems.pages.dev/api/v1/sms/queue?shop_id=SHOP_UUID"

# Claim jobs
curl -X POST -H "Authorization: Bearer $EMS_KEY" -H "content-type: application/json" \
  -d '{"limit":5}' "https://your-ems.pages.dev/api/v1/sms/claim?shop_id=SHOP_UUID"

# Queue an SMS
curl -X POST -H "Authorization: Bearer $EMS_KEY" -H "content-type: application/json" \
  -d '{"phone":"+8801700000000","message":"Test from API","idempotencyKey":"demo-1"}' \
  "https://your-ems.pages.dev/api/v1/sms/send?shop_id=SHOP_UUID"
```

## 6. Security model

- Keys are stored as **SHA-256 hashes** (`api_keys.key_hash`); the plaintext is
  shown once and never persisted or logged.
- Every response is a **whitelisted projection** — raw database rows, password
  hashes, provider API keys, and internal columns are never serialized.
- Scope checks run on every request; revocation and expiry are enforced
  server-side on every request (no cached grants).
- Key creation, update, revocation, and deletion are written to the EMS
  activity log.
- `last_used_at` powers the **Online** indicator in the admin console so you
  can spot unused or unexpected credentials.

## 7. Migrating EMS off Supabase later

The Public API is intentionally storage-agnostic:

- All queries go through `functions/_lib/db.js`, which already speaks both
  Supabase (PostgREST) and Cloudflare D1. A dedicated Postgres/MySQL server
  only needs a third driver in that one file.
- External apps depend exclusively on the `/api/v1` JSON contract documented
  here — endpoint paths, request/response shapes, and the `emsk_` key format
  do not change when the backend moves.
- The `api_keys` table ships in both migration dialects:
  - Supabase/Postgres: `supabase/migrations/045_public_api_credentials.sql`
  - Cloudflare D1: `supabase/d1/migration_public_api_credentials.sql`
- If the API host domain changes, integrations only update their configured
  **Base URL** — keys and payloads stay valid.

## 8. Retired legacy endpoints

The old ConnectX Android **device-token** connection (admin-password login on
the phone + 400-day device JWTs) has been removed. These endpoints now return
`410 Gone`:

- `connectx/gateway/*` (register, shops, heartbeat, claim, report, stats,
  activity, emails, sim, test, disconnect, me, sim-carrier)
- `connectx/devices*` (list, revoke, set-primary)

Equivalent functionality lives under `/api/v1` (see §4). Existing ConnectX
installations must be updated to authenticate with an API key — see
`ConnectX/CONNECTX_API_MIGRATION.md` for the exact old→new endpoint mapping.

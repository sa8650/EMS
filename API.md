# EMS public API and ConnectX device API

## Former API-key surface

The legacy EMS public API `/api/v1/*` and Owner Console API-key workflow are retired and return `410 Gone`. Do not use `emsk_…` keys, Connect App pairing, or a ConnectX Control endpoint for SMS.

## Direct ConnectX device API

ConnectX Android authenticates directly to the EMS HTTPS origin. Administrator sign-in and shop discovery are scoped by EMS credentials; device registration creates a revocable shop-scoped `cxd_…` token whose SHA-256 hash is stored in EMS. Device endpoints are under `/api/connectx/device/*`, including heartbeat, SIM/test status, job claim/start, result acknowledgement, and stats. The app also uses the EMS-authenticated routes for SMS and email history.

The API is not a generic public API and must not be proxied through ConnectX Control. Job claims are scoped to the registered device/shop; result reporting requires the claim token. See `functions/_lib/connectx_device.js`, `functions/_lib/connectx_sms.js`, and `functions/api/[[path]].js` for implementation and tests. Full rollout instructions: [`CONNECT_APP.md`](CONNECT_APP.md) and `../MIGRATION_DEPLOYMENT.md`.

## ConnectX Control monitoring relationship

ConnectX Control does not call EMS. The Android app sends SMS queue, send, and delivery results directly to EMS as before, and separately posts app heartbeats and a monitoring copy of SMS status to ConnectX Control using a distinct Control-issued device token. Control stores that copy in its own D1 database. A Control outage must never block or delay SMS reporting to EMS.

## Persora Connections API

`/api/persora/*` is a dedicated server-to-server API for Persora's backend only; browsers never call it. Every request must be enabled in the Owner Console and HMAC-signed with the shared secret (±300 s window). Data routes also need a per-administrator `pg1_…` grant, issued only after the administrator's own EMS credentials are checked.

The API is strictly read-only: `account`, `files` and `files/:id/content`. Every other verb returns `405 read_only`. All queries are scoped to the grant's administrator. See [`PERSORA_INTEGRATION.md`](PERSORA_INTEGRATION.md).

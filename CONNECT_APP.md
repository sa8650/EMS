# ConnectX direct SMS and device integration

The former EMS Owner Console **Connect App** handshake and ConnectX Control SMS relay are retired. Do not enter a Control endpoint, pairing code, API key, or shared secret. **EMS is the authoritative SMS queue and the Android app authenticates directly to EMS over HTTPS.**

## Current delivery path

```text
EMS persistent queue ↔ HTTPS ↔ ConnectX Android → selected physical SIM → recipient
```

1. An EMS administrator signs in directly from the ConnectX Android app.
2. EMS returns only that administrator's authorized shops.
3. The app registers a device for a selected shop. EMS stores a hash of its revocable device token.
4. The app polls and atomically claims authorized jobs, validates the selected SIM, sends with Android `SmsManager`, then reports the result directly to EMS.
5. EMS keeps message history and differentiates `pending`, `processing`, `sent` (send request accepted), `delivered` (carrier-confirmed), `failed`, and `unknown` (ambiguous outcome).

ConnectX Control is not in this path. Its existing release page may distribute APK updates, but Control outage must not prevent SMS login, polling, dispatch, or result reporting. No Firebase/FCM or paid messaging service is used.

## Migration prerequisites

- Deploy EMS code containing the `/api/connectx/device/*` routes and direct queue processor.
- Apply `supabase/migrations/066_connectx_direct_sms.sql` once to Supabase, **after** the migrations already used by the deployment (including 046 where applicable), or apply `supabase/d1/migration_connectx_direct_sms.sql` once to D1 after `migration_connectx_gateway.sql` and `migration_connect_app.sql`.
- Back up the database first. The D1 migration rebuilds only `connectx_sms_messages` to widen the allowed status set; it preserves historical rows and maps ambiguous old relay states to `unknown`, not to an automatic resend.
- The Android build's default EMS origin is `https://ems-v1.pages.dev`; configure another deployment with `-PemsBaseUrl=https://your-ems-host.example`.
- EMS returns the device polling interval in its heartbeat response. Configure the existing Pages variable `CONNECTX_POLL_INTERVAL_SECONDS` to an integer from 10 to 300 (default 30). Android applies adaptive network backoff up to five minutes and polls immediately when connectivity returns.
- Install an APK signed with the same certificate as the existing `com.connectx.gateway` app. Legacy Control device tokens are not imported. Each user signs in and registers with EMS again.

See [`CONNECTX_SMS.md`](CONNECTX_SMS.md) for preserved shop settings and rules, and the shared workspace's `MIGRATION_DEPLOYMENT.md` for the staged three-repository rollout and validation plan.

## Retired workflow

- No manual Connect Endpoint in EMS or ConnectX Control.
- No pairing request, approval, shared relay secret, connection ID, or Control SMS queue.
- `POST /connect` and old Connect App setup endpoints are retired. The old public `/api/v1/*` API remains `410 Gone`; it is not a route for device SMS.

Email functionality remains an EMS responsibility and is separate from this SMS delivery path.

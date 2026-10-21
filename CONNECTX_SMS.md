# ConnectX SMS in EMS

EMS owns the persistent shop SMS queue and calls no ConnectX Control SMS relay. The Android app authenticates and polls EMS directly, then sends authorized jobs through the SIM selected for that shop. See [CONNECT_APP.md](CONNECT_APP.md) and the shared `MIGRATION_DEPLOYMENT.md` for the direct-device API, rollout, and checks.

## Preserved shop behavior

In each licensed shop, **ConnectX → SMS Gateway → Settings**, **Compose**, and **History** retain the existing shop workflow. Per-shop templates and automatic sale/payment/return/exchange/refund triggers remain. Due reminders remain an opt-in manual batch action. Limits, templates, SIM selection, ConnectX add-on/license checks, automatic triggers, and message history continue to be evaluated by EMS.

Selecting a sales invoice previews the shop's saved `SALE` template using invoice totals, customer, and phone. Due-reminder, return, and exchange templates are previewed for their respective choices. Shop users can review/edit a composed SMS before queuing. Payment and refund templates remain attached to their automatic transaction triggers. The selected invoice and recipient must belong to the current shop.

## Queue and delivery states

SMS is stored in `connectx_sms_messages` with a stable ID/idempotency key. EMS returns a queue acknowledgement, not a delivery promise. The direct app claims jobs using EMS device/shop authorization, reports the SIM used and send outcome, and never reports a recipient delivery merely because Android accepted a send request.

- `pending`: eligible for a claim.
- `processing`: claimed by a registered device.
- `sent`: Android/carrier accepted the send request; recipient receipt is not confirmed.
- `delivered`: carrier delivery report confirmed delivery.
- `failed`: definite send failure.
- `unknown`: a send may have started but its final outcome cannot safely be determined; ambiguous messages are not automatically resent.
- `cancelled`: cancelled while still safely pending.

EMS uses bounded retries/timeouts and stale-claim recovery. Pre-send stale claims can return to the queue; an ambiguous post-send state becomes `unknown` rather than risking a duplicate. The polling baseline is configurable with the existing EMS Pages variable `CONNECTX_POLL_INTERVAL_SECONDS` (10–300 seconds; default 30); Android also uses adaptive backoff up to five minutes and polls immediately when network connectivity returns. Website outages at ConnectX Control do not affect SMS.

## Deployment and tests

For existing Supabase deployments, back up and apply `supabase/migrations/066_connectx_direct_sms.sql` once. For D1, after the existing gateway and Connect App migrations, back up and apply `supabase/d1/migration_connectx_direct_sms.sql` once. The D1 script rebuilds only the SMS table to widen the status constraint and preserves its historical rows. It also creates the direct-device table if legacy migration 045 removed it.

Verify with `npm test` in EMS. Then stage real-device tests for direct delivery, duplicate enqueue/idempotency, offline recovery, stale claims, selected/removed SIM, multi-shop authorization, Control outages, email, and app updates. A local test cannot verify carrier delivery.

Implementation entry points include `functions/_lib/connectx_sms.js`, `functions/_lib/connectx_device.js`, `functions/_lib/db.js`, and `functions/api/[[path]].js`. The older signed Connect App relay is no longer in the delivery path.

# EMS Connect App

EMS no longer exposes a public API or API keys. Products connect through
**Connect App**. EMS never reads another product’s database, and it never
talks to the ConnectX Android app.

## What you do once

1. Sign in to the **EMS Owner Console**.
2. Open **Connect App**.
3. Copy nothing into the phone. On ConnectX, open **Connect App** and copy
   its Connect Endpoint (for example `https://connectxweb.pages.dev/connect`).
4. Paste that endpoint into EMS and send the connection request.
5. On ConnectX, approve the request and match the pairing code.
6. Both sides show **Connected**.

The connection stores a Connection ID, a shared secret, permissions
(`sms:send`), the remote Application ID, and the remote Connect Endpoint.
Either side can disconnect.

Apply `supabase/migrations/046_connect_app.sql` before the first use
(or `supabase/d1/migration_connect_app.sql` on D1).

## SMS

A shop SMS is given a Request ID such as `SMS-10001` and sent:

```text
EMS → EMS Connect Server → ConnectX Connect Server → ConnectX Web
    → ConnectX Android app → selected SIM → recipient
```

The result comes back the same way. EMS then shows `SUCCESS` or `FAILED`
for that Request ID. If the phone is offline, ConnectX keeps the job
`PENDING` until the phone reconnects (`PENDING → PROCESSING → SUCCESS`
or `FAILED`). The same Request ID is never processed twice.

`POST /api/v1` now answers `410`. Use `POST /connect`.

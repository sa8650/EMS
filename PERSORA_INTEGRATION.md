# Persora Connections: EMS side

Persora is a separate Dexter Studio product. It lets an EMS **administrator** connect their EMS account from Persora's **Connections** page and browse their **Vaultium** files **read-only**:

- They can view, download, or save an independent copy into their Persora storage.
- Nothing can be uploaded, renamed, edited, overwritten or deleted in EMS.

There are no browser redirects. The administrator types their EMS email and password into Persora, and Persora's backend calls the EMS API described below server-to-server.

The implementation lives in `functions/_lib/persora_integration.js`. It is mounted in `functions/api/[[path]].js`, before the session gate for `/api/persora/*` and after the owner gate for the Owner Console routes. Tests are in `test/persora-integration.test.js`.

---

## 1. Security model: three independent gates

Every `/api/persora/*` request must pass all three:

1. **Enabled.** The Owner Console toggle must be on. Otherwise EMS returns `403 integration_disabled`.
2. **Signed by Persora.** The request must carry a valid HMAC-SHA256 signature made with the shared secret:
   ```
   hex(HMAC-SHA256(secret, "ems-persora-v1\n" + ts + "\n" + nonce + "\n" + METHOD + "\n" +
                           pathname+search + "\n" + sha256hex(body) + "\n" + sha256hex(grant or "")))
   ```
   The headers are `x-persora-timestamp` (unix seconds, **±300 s**), `x-persora-nonce` (16–128 characters from `[A-Za-z0-9_-]`) and `x-persora-signature`. Failures return `401 signature_invalid` or `401 request_expired`. The signature covers the body and the grant, so neither can be swapped.
3. **Administrator grant.** Data routes need `Authorization: Bearer pg1_…`. Persora obtains a grant through `POST /api/persora/authorize` with the administrator's **own** EMS email and password, checked using the same PBKDF2 path as the normal EMS login.

**The shared secret never authenticates an administrator.** It only proves the caller is Persora.

### Grants

- Grants are 32 random bytes in the form `pg1_…`. EMS stores only `sha256:` hashes of them in `persora_grants`.
- Each grant is bound to a marker derived from the administrator's current password hash. Changing the password invalidates every grant.
- Grants slide-expire after **180 days** without use.
- A grant ends when any of these happens:
  - an explicit `POST /api/persora/revoke`;
  - the administrator is deactivated (`403 account_inactive`);
  - the owner clicks **Revoke all connections**.
- Reconnecting the same Persora user replaces their previous grant.
- An invalid or expired grant returns `401 grant_invalid`, and Persora asks the member to **Reconnect EMS**.

### Vaultium eligibility

Checked on authorize **and** on every data request. An administrator is eligible if they have **purchased Vaultium at least once**:

- an approved license with `vaultium_gb > 0` (`active` or `expired`), or
- an approved `vaultium` add-on purchase (`active` or `expired`), or
- a current entitlement with Vaultium storage.

Pending or rejected purchases never count. If the administrator was never eligible, EMS returns `403 vaultium_not_eligible`. The response includes `eligibility {eligible, sources, first_purchased_at, vaultium_active}`, and an expired subscription still shows as eligible with `vaultium_active:false`.

### Read-only and IDOR protection

- The only routes are `ping`, `authorize`, `revoke`, `GET account`, `GET files` and `GET files/:id/content`. Any other method on a data path returns `405 read_only`.
- Every query is filtered by the grant's `admin_id`. `store_id` and file ids are validated as UUIDs, and the shop must belong to the administrator. Another administrator's shop or file returns **404**, never data.
- Internal R2 keys are never returned. Files are streamed with `nosniff` and `no-store`.
- Successful connections are audited as `persora.connected` in the administrator's audit trail.

---

## 2. API

| Route | Grant | Response |
| --- | --- | --- |
| `/api/persora/ping` | — | `{ok:true}`. Used by Persora's **Test connection**. |
| `POST /api/persora/authorize` `{email,password,persora_user_ref,label?}` | — | `201 {grant, grant_id, admin, eligibility, expires_at}` |
| `POST /api/persora/revoke` | ✓ | `{ok:true}` |
| `GET /api/persora/account` | ✓ | `{admin, eligibility, stores[{id,name,shop_code,status,file_count}], total_files}` |
| `GET /api/persora/files?store_id=&q=&limit=&offset=` | ✓ | `{files[], total, offset, limit, has_more}` (`limit` at most 200) |
| `GET /api/persora/files/:id/content` | ✓ | File bytes plus the headers `x-ems-file-name`, `x-ems-file-size`, `x-ems-store-id`, `x-ems-reference` |

Owner Console (owner session only):

| Route | Purpose |
| --- | --- |
| `GET /api/platform/persora-integration` | Masked status: `enabled`, `ready`, `secretConfigured`, `secretHint` (last 4 characters), `secretSource`, `activeGrants`, `lastUsedAt`, `lastVerifiedAt`. |
| `PATCH /api/platform/persora-integration` `{enabled?, secret?, clearSecret?}` | Saves settings. Enabling requires a secret. The secret must be 32–256 printable characters. |
| `POST /api/platform/persora-integration/revoke-all` | Revokes every active grant. |

---

## 3. Database

- **Supabase:** run [`supabase/migrations/067_persora_integration.sql`](supabase/migrations/067_persora_integration.sql) once in the SQL Editor. It is idempotent.
- **D1:** run `npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_persora_integration.sql`.
- New databases created from the baselines already include the table.

The migration creates `persora_grants` (`id`, `admin_id` → administrators with cascade, `token_hash` unique, `credential_marker`, `persora_user_ref`, `label`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `revoked_reason`). It has RLS enabled and is service-role only.

Settings are stored in `platform_settings` under the key `persora_integration`. The secret is encrypted with AES-GCM, using a key derived via HKDF from `SESSION_SECRET`. Only the last four characters are kept for display. **Factory reset** clears `persora_grants`.

---

## 4. Setup

1. Apply the migration (see §3).
2. Generate a secret of at least 32 characters, for example `openssl rand -base64 48 | tr '+/' '-_' | tr -d '='`, or use **Generate secret** in the console.
3. Go to Owner Console → **Services → Persora Connections**. Paste the secret, set **Enabled**, and save.
   - Alternative: set the encrypted Pages secret **`PERSORA_INTEGRATION_SECRET`**. It overrides the console value and locks the field.
4. In **Persora Admin → Integrations**, enter the EMS address shown on the EMS page (your HTTPS origin), paste the **same** secret, and enable. Then click **Test connection to EMS**.
5. Make sure both servers' clocks are accurate to within ±300 s.

**Rotating:** save the new secret in EMS and in Persora. Requests fail until both sides match, but members' connections survive. **Disabling** either side blocks access immediately and keeps existing grants. Rotating `SESSION_SECRET` makes the stored integration secret unreadable, so re-enter it afterwards.

The secret is never returned by any API, never logged, and never placed in `assets/js/config.js` or any `PUBLIC_*` variable.

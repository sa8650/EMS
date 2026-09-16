# EMS V1 — Database Setup

EMS works with **either** of two databases. You pick one per deployment — no
code changes are required, only environment configuration:

| Option | Service | How the API talks to it | When to choose it |
| --- | --- | --- | --- |
| **Supabase** (default) | Supabase Postgres | PostgREST over HTTPS | Managed Postgres, familiar SQL editor, existing deployments |
| **Cloudflare D1** | Cloudflare SQLite, inside Pages/Workers | D1 binding (`env.DB`) | All-in-on-Cloudflare, zero external database, lower latency from the Pages function |

Both options run the exact same API (`functions/api/[[path]].js`). A small
driver layer (`functions/_lib/db.js`) translates the API's PostgREST-style
queries to D1 and emulates the handful of Postgres functions (RPCs) EMS uses.

There is **no separate EMS database server** — everything lives in Supabase or
D1 as chosen below.

---

## 1. Option A — Supabase (default)

### 1.1 Create the project
1. Create a new project at <https://supabase.com/dashboard> (or reuse an
   existing empty one).
2. Wait for it to finish provisioning.

### 1.2 Apply the schema
1. Open **SQL Editor → New query**.
2. Open [`supabase/ems_complete_schema.sql`](supabase/ems_complete_schema.sql),
   paste the **entire** file, and click **Run**.
   - This single file is the *complete, consolidated* schema: all 38
     application tables, indexes, sequences, stored functions (invoice
     posting/deletion, entitlement application, factory reset), seed
     defaults, and Row Level Security.
   - It is idempotent — safe to re-run.
   - You do **not** need any of the older numbered files in
     `supabase/migrations/`. They are kept only as historical reference;
     `ems_complete_schema.sql` already contains every change they made
     (including previously-unversioned objects such as `vaultium_files` and
     the `vaultium_gb` entitlement columns).

### 1.3 Configure the Pages variables
Pages dashboard → your project → **Settings → Variables and secrets**:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API → Project URL, e.g. `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` key (secret) |
| `SESSION_SECRET` | Any long random string (used to sign login tokens) |

Do **not** set `DB_DRIVER` (leave it blank). Supabase is selected automatically
when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present.

Optional secrets for the premium features: `BREVO_API_KEY` (ConnectX),
`GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY` (alternative Zudo models).

---

## 2. Option B — Cloudflare D1 (SQLite)

Prerequisites: Node.js and `npx wrangler` (Wrangler will ask you to log in once:
`npx wrangler login`).

### 2.1 Create the D1 database
```bash
npx wrangler d1 create ems-d1
```
Wrangler prints a block like:
```toml
[[d1_databases]]
binding = "DB"
database_name = "ems-d1"
database_id = "abc12345-....-...."
```
Copy the `database_id`.

### 2.2 Enable the binding in `wrangler.toml`
Open [`wrangler.toml`](wrangler.toml), uncomment the D1 block at the bottom and
paste the id:
```toml
[[d1_databases]]
binding = "DB"
database_name = "ems-d1"
database_id = "abc12345-....-...."
```

### 2.3 Apply the schema
Local development database:
```bash
npx wrangler d1 execute ems-d1 --file=supabase/d1/schema.sql
```
Remote database (used by the deployed Pages site):
```bash
npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/schema.sql
```
The file creates all tables, indexes, the `_sequences` helper table, and the
seed defaults (branding, theme, public pages, add-on catalogue, AI settings).

> **Upgrading an existing D1 database** after Vaultium gained expense
> attachments — run once (a `duplicate column name` error means it was already
> applied):
> ```bash
> npx wrangler d1 execute ems-d1 --remote --file=supabase/d1/migration_vaultium_expense_links.sql
> ```
> Existing **Supabase** databases run the equivalent idempotent
> [`supabase/migrations/migration_vaultium_expense_links.sql`](supabase/migrations/migration_vaultium_expense_links.sql)
> in the SQL Editor.

### 2.4 Configure the Pages variables

| Variable | Value |
| --- | --- |
| `DB_DRIVER` | `d1` |
| `SESSION_SECRET` | Any long random string |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are **not needed** for D1 and can
be left unset. (If both are configured, `DB_DRIVER=d1` wins.)

The D1 binding is named **`DB`** — do not rename it without also updating
`functions/_lib/db.js`.

### 2.5 Local development with D1
`npx wrangler pages dev .` will use the local D1 database after you have
applied the schema without `--remote` (step 2.3 first command).

---

## 3. Verifying the driver choice

After deploying, the first request that hits the API will return
`500 Server configuration is incomplete` with a message naming the missing
variable/binding if anything is misconfigured. In a healthy deployment:

- **Supabase mode** — register the EMS owner from the landing page and confirm
  branding/owner creation succeeds.
- **D1 mode** — same; additionally you can inspect data with
  `npx wrangler d1 execute ems-d1 --remote --command "select name from sqlite_master where type='table'"`.

A development smoke test of the D1 driver lives at
[`scripts/d1-smoke.mjs`](scripts/d1-smoke.mjs) (run `npm i && node scripts/d1-smoke.mjs`).
It creates an in-memory SQLite database, applies `supabase/d1/schema.sql`, and
exercises inserts, codes, invoice posting/stock, embeds, upserts, entitlements
and factory reset through the real driver.

---

## 4. What the driver emulates on D1

PostgREST features used by the API and supported on D1:

- filters: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `is.true/false/null`,
  `in.(...)`, `like`/`ilike`, combined with `AND`
- `order`, `limit`, `offset`
- upserts via `on_conflict` + `Prefer: resolution=merge-duplicates`
- embedded resources used by the app (e.g.
  `invoices?select=*,invoice_lines(*,inventory_items(...)),stores(...)`,
  `licenses?...&select=*,license_plans(...),administrators(...)`)
- human-readable codes (`SUP-00001`, `CUS-000001`, `EXP-00001`, `ITM-0000001`)
- booleans stored as `0/1`, `jsonb` / Postgres arrays stored as JSON text

Postgres functions re-implemented in JavaScript for D1
(`functions/_lib/db.js → d1Rpc`):

| Function | Purpose |
| --- | --- |
| `next_ems_invoice_number` / `peek_ems_invoice_number` | `SAL-` / `PUR-` numbering (uses the D1 `_sequences` table plus a max-scan) |
| `post_invoice` | atomic invoice insert + lines + stock movement with stock guards |
| `delete_posted_invoice` | reverses stock movement, guards purchases already sold |
| `apply_current_entitlement` | writes `current_entitlements` and flips shops between `active` / `read_only` by shop limit |
| `factory_reset_ems` | wipes all data tables and re-seeds platform defaults |

Type mapping summary:

| Postgres | SQLite (D1) |
| --- | --- |
| `uuid` (PK/FK) | `TEXT` (driver generates `crypto.randomUUID()`) |
| `bigint generated always as identity` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `boolean` | `INTEGER` (`0`/`1`) |
| `jsonb` | `TEXT` containing JSON |
| `text[]` | `TEXT` containing a JSON array |
| `numeric` | `REAL` |
| `timestamptz` / `date` | ISO-8601 `TEXT` |
| generated `due numeric generated always as … stored` | `REAL GENERATED ALWAYS AS … STORED` |
| code sequences (`supplier_code_seq`, etc.) | driver-side max-scan (no sequences needed) |

---

## 5. Notes & limitations

- **Migrating data between providers is a manual export/import** — choosing D1
  vs Supabase is a deployment decision; there is no built-in live sync. Start
  a new deployment on one provider.
- **RLS:** PostgREST access uses the service-role key (which bypasses RLS);
  RLS is still enabled and direct anon/authenticated access is revoked on every
  table, as in the original design. D1 is only reachable through the Pages
  Function (the binding is never exposed to the browser).
- **Foreign keys on D1** are declared with the same actions as Postgres
  (`CASCADE`/`SET NULL`/`RESTRICT`); D1 enforces them.
- The owner account (single EMS owner), administrators and shops are created
  through the UI after deployment. Schema seeds contain **no business data**.
- R2 (`VAULTIUM` bucket for the Vaultium add-on) is independent of the
  database choice and configured the same way in both setups; only file
  *metadata* (`vaultium_files`) lives in the chosen database.

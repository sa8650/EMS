# EMS — powered by DoxTox

**EMS V1** is a multi-shop retail management system: one platform where a single
platform owner hosts many businesses, each business (administrator) runs one or
more stores, and store staff handle daily sales, stock, dues, expenses and
salaries from a simple dashboard.

It is a static single-page app served by **Cloudflare Pages**, powered by a
**Cloudflare Pages Functions API** (`functions/api/[[path]].js`) and a
**Supabase PostgreSQL** database.

> This repository contains **only the EMS application**. It is fully standalone —
> the site root (`/`) is the EMS landing page and app.
>
> **Related docs:** [`OWNER-CONSOLE.md`](OWNER-CONSOLE.md) — the EMS Owner
> Console guide (pages, workflow and a full explanation of how its Agent Bento
> Grid CSS/theme system works) · [`admin.md`](admin.md) — the Administrator
> Panel guide and its Agent Bento Grid CSS/theme documentation ·
> [`ADDONS.md`](ADDONS.md) — Premium Add-Ons user guide.

---

## Table of contents

1. [How EMS works](#how-ems-works)
2. [The four surfaces](#the-four-surfaces)
3. [Core concepts](#core-concepts)
4. [How to use EMS](#how-to-use-ems)
5. [Operating sequence](#operating-sequence)
6. [Important security model](#important-security-model)
7. [Local start](#local-start)
8. [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)
9. [Payments](#payments)
10. [Staff Salary system](#staff-salary-system)

---

## How EMS works

### Architecture

```
Browser (single-page app)
  assets/js/app.js  ── all UI, rendering, routing
  assets/css/app.css── public site + Shop Panel theme
  assets/css/owner.css ─ Owner Console theme (own design system, scoped to body.ob-on)
  assets/css/admin.css ─ Administrator Panel theme (own design system, scoped to body.adm-on)
        │
        ▼  fetch('/api/…')  with Bearer token
Cloudflare Pages Functions
  functions/api/[[path]].js ── the ONLY API file: auth, permissions,
        │                     licenses, add-ons, Zudo, ConnectX, Vaultium…
        ▼  (service-role key, server-side only)
Supabase PostgreSQL
  supabase/migrations/001…033 ── custom auth tables, shops, invoices,
                                 license plans, add-ons, helpdesk, salary…
```

- **One page, four apps.** `index.html` boots `assets/js/app.js`, which decides
  what to render from the URL and the saved session: the public website, the
  Owner Console, the Administrator Panel or the Shop Panel.
- **All data access goes through the API.** The browser never talks to Supabase
  directly and never sees the service-role key.
- **Everything is a license/permission decision.** The API checks the session's
  role (owner / admin / staff), the store's license state, the staff member's
  permission sections and the shop's purchased add-ons before doing anything.

### Sessions and authentication

- Passwords and sessions are handled **only** by `/functions/api/[[path]].js`
  (custom tables — Supabase Auth is not required).
- A successful login returns a signed token; the app stores the session in
  `localStorage` (`ems.session`) and sends it as an
  `Authorization: Bearer …` header on every API call.
- The token carries an expiry; the app auto-logs-out when it expires.
- Staff sessions are re-synced on load (`/api/me` + availability endpoints) so
  permission changes, read-only mode and license expiry apply immediately.

### Roles

| Role | Who they are | Where they sign in | What they get |
|---|---|---|---|
| **Owner** | The platform owner (you, hosting EMS) | `EMS login` on the landing page | The **Owner Console** — platform-wide control (see [`OWNER-CONSOLE.md`](OWNER-CONSOLE.md)) |
| **Administrator** | A business using your platform | `Administrator login` | Administrator Panel: profile, stores, licenses, devices, HelpDesk, Premium Add-Ons |
| **Staff** | An employee of a store | `Shop login` (Store ID + User ID + password) | Shop Panel: only the modules their permissions allow |

---

## The four surfaces

### 1 · Public website (`/`)

The marketing site and entry point: landing page with features and pricing,
About, Terms, Blog (+ single posts) and a Contact form. Also hosts:

- **Invoice verification** — every invoice can carry a TrueBill QR code;
  scanning it opens `/?verify=<token>` and shows the authentic EMS record.
- The three login buttons: **Administrator login**, **Shop login** and
  **EMS login** (owner only).

### 2 · Owner Console (owner role)

A dedicated console with its own independent UI (the "Agent Bento Grid"
design system in `assets/css/owner.css`) covering 16 pages in five groups:

| Group | Pages |
|---|---|
| Platform | Overview |
| Business | License control · License plans · Administrators · Shops |
| Website | Website branding · Website pages · Blogs · Contact messages |
| Services | ConnectX · Zudo AI · TrueBill · Vaultium · HelpDesk · Premium Add-Ons |
| System | Factory reset |

It controls the whole platform: approve/reject license payments, define license
plans and entitlements, manage administrators and shops, edit the public
website content/branding, configure every add-on, talk to administrators in
HelpDesk, and (carefully) factory-reset the platform. Full details and the
CSS/theme documentation: [`OWNER-CONSOLE.md`](OWNER-CONSOLE.md).

### 3 · Administrator Panel (admin role)

Left-sidebar panel for a business: **My Profile, Store Manage, Licenses,
Devices, HelpDesk, Premium Add-Ons**. From Store Manage an administrator can
also enter a store (opening the Shop Panel with admin rights) and return.
If the administrator's license lapses, their shops drop into read-only mode.
The panel has its own design system (`assets/css/admin.css`, scoped to
`body.adm-on`) — full details and the CSS/theme documentation:
[`admin.md`](admin.md).

### 4 · Shop Panel (staff role)

The day-to-day dashboard: Dashboard, Suppliers, Customers, Inventory,
Purchases, Sales, Expense, Due Recover, Staff Manager (staff + attendance +
salary), Report, Settings — plus the add-on modules (ConnectX, Zudo, Vaultium)
when the administrator has purchased them and staff permissions allow them.
Each staff member sees only what their permission sections allow.

---

## Core concepts

- **Store** — one shop inside a business. Created inactive until a license is
  approved. Identified by a short Store ID (staff use it to sign in).
- **License** — a store's subscription. A plan is chosen and paid manually
  (bKash/Nagad); the claim (sender number + transaction ID) is submitted for
  review and an owner/administrator approves it. Expired licenses put the
  store in **read-only mode**.
- **License plan** — what a store is entitled to: duration, shop-create limit,
  invoice limits, and Premium Add-On entitlements.
- **Premium Add-Ons** — optional paid services on top of plans:
  **ConnectX** (business email), **Zudo AI** (read-only AI assistant),
  **AI Business Health** (report generator), **TrueBill** (invoice QR
  verification), **Vaultium** (file storage on Cloudflare R2). The owner sets
  pricing/limits; administrators purchase; staff use them if permitted.
  See [`ADDONS.md`](ADDONS.md).
- **HelpDesk** — a continuous owner ↔ administrator conversation per
  administrator, with unread badges on both sides.
- **Read-only mode** — when a store's license is inactive/expired, staff can
  view everything but change nothing (the app shows a clear notice).

---

## How to use EMS

### As the platform owner

1. Open `/` → **EMS login**. First time? Use *Initialize first EMS owner* to
   create your account.
2. You land in the **Owner Console Overview** — a live snapshot of
   administrators, shops, licenses and the verification queue.
3. Check **License control** regularly: pending bKash/Nagad payments are listed
   there. Verify the transaction ID in your own statement, then **Approve**
   (or **Reject**) — approving activates the store instantly.
4. Define what money buys in **License plans** (duration, limits, add-on
   entitlements) and **Premium Add-Ons** (per-add-on pricing, allowed days and
   daily limits, coupon codes, payment instructions shown at checkout).
5. Shape the public website in **Website branding / Website pages / Blogs**,
   and read **Contact messages**.
6. Configure the services in **Services**: ConnectX sender identity and limits,
   Zudo AI model + daily limits (+ Business AI Health), TrueBill pricing and
   verification URL, Vaultium (follow the R2 binding instructions shown).
7. Answer administrators in **HelpDesk**; the sidebar badge shows unread
   messages.
8. **Factory reset** (last resort) wipes platform data — it requires typing a
   confirmation phrase.

### As an administrator

1. Open `/` → **Administrator login** (or register the first administrator).
2. In **Store Manage**, create a store and submit its license payment claim
   (method, sender number, transaction ID).
3. While the claim is pending you can explore; once approved the store goes
   active. Keep licenses renewed — expiry switches your stores to read-only.
4. In **Licenses**, review plan options; in **Premium Add-Ons**, buy add-ons
   (coupons apply) — see [`ADDONS.md`](ADDONS.md).
5. Open a store from **Store Manage** to run it (Shop Panel with admin rights),
   then **Return to admin**.
6. Use **Devices** to review signed-in devices, and **HelpDesk** to message
   the platform owner.
7. Manage staff from inside the store: **Staff Manager** → add staff, set
   their permission sections, then give them the Store ID + User ID +
   password they'll use to sign in.

### As shop staff

1. Open `/` → **Shop login** → enter **Store ID, User ID and password**.
2. You see only the modules your permissions allow. Typical daily flow:
   record **Purchases** when stock arrives → keep **Inventory** correct →
   make **Sales** (invoices, payments, partial dues) → record **Expenses** →
   collect **Due Recover** payments → check the **Dashboard/Reports**.
3. If your shop has add-ons: ask **Zudo** questions about your data, send
   **ConnectX** emails, store files in **Vaultium**.
4. Read-only mode means your license expired — you can still read everything;
   contact your administrator.

---

## Operating sequence

1. Register an administrator, then sign in.
2. Create a store; it begins inactive until a license is approved.
3. Submit a bKash/Nagad license request with the sender number and transaction ID.
4. An administrator records approval using the license update API (a platform/super-admin interface can be added separately).
5. Create staff in the Shop → Staff Manager page. Staff sign in with Store ID, User ID and password.

## Important security model

Passwords and sessions are handled only by `/functions/api/[[path]].js`. The browser never receives the Supabase service role key. Do **not** put any secret in `assets/js/config.js` or a Cloudflare `PUBLIC_*` variable. Custom auth tables are used; Supabase Auth is not required.

## Local start

1. Install Node 20+ and `npm install`.
2. Create a Supabase project. In SQL Editor run `supabase/migrations/001_ems_schema.sql`, `supabase/migrations/002_invoice_rpc.sql`, `supabase/migrations/003_platform_owner.sql`, `supabase/migrations/004_license_plans_and_capacity.sql`, `supabase/migrations/005_shop_id.sql`, `supabase/migrations/006_license_plan_flexible_values.sql`, `supabase/migrations/007_free_license_payment_method.sql`, `supabase/migrations/008_administrator_id.sql`, `supabase/migrations/009_business_short_ids.sql`, then `supabase/migrations/010_invoice_number_preview.sql`, `supabase/migrations/011_safe_invoice_delete.sql`, `supabase/migrations/012_due_recovery.sql`, `supabase/migrations/013_invoice_verification_qr.sql`, `supabase/migrations/014_custom_invoice_party.sql`, then `supabase/migrations/015_connectx_v1.sql`, then the remaining migrations in numbered order (`016` … `033_staff_salary.sql`).
3. Copy `.dev.vars.example` to `.dev.vars`, insert the three real secrets, and generate `SESSION_SECRET` with `openssl rand -base64 48`.
4. Run `npm run dev`. Register the first administrator at `/`.

## Deploy to Cloudflare Pages

1. Create a Git repository, commit this project, and push it to GitHub/GitLab.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → connect the repository.
3. Build command: leave blank. Build output directory: `.`.
4. Settings → Variables and Secrets → add encrypted secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`.
5. Deploy. Add your production custom domain in Pages → Custom domains.
6. In Supabase Settings → API, keep the service-role key private. It is server-only.

For the optional AI and storage bindings, `wrangler.toml` already declares the
Workers AI binding (`AI`, used by Zudo) and the R2 bucket binding
(`VAULTIUM`, used for file storage) — create the `emsvaultium` bucket in your
Cloudflare account or adjust the name before deploying.

## Payments

The requested manual flow only records payment claims. It does not prove that bKash/Nagad payment occurred. Before activating any license, staff must manually verify the bKash/Nagad transaction ID in the administrator's own statement/app.

## Staff Salary system

Open **Staff Manager → Salary** (button beside **Attendance**). Features:

- Staff list with search; per-staff profile card and summary cards
  (monthly salary, outstanding due, taken advance, total paid YTD).
- Salary invoice builder: current salary / outstanding due / advance types,
  attendance-based prorating (from real attendance records of the month),
  incentive, bonus, fine, other deductions, add-outstanding and cut-advance
  toggles, paid amount, live total/paid/due/net calculation.
- Salary history table per staff with delete (permission-gated).
- Totals are recomputed server-side; data is stored in
  `staff_salary_invoices` (`supabase/migrations/033_staff_salary.sql`).
- New permission section `salary` (view/add/delete) in staff permissions.

## Payments manual-flow caveat

License payments are recorded as claims only; verify each transaction ID before approval.

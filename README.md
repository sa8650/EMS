# EMS — powered by DoxTox

Multi-shop management system for Cloudflare Pages Functions and Supabase PostgreSQL.

> This repository contains **only the EMS application**. It is fully standalone —
> the site root (`/`) is the EMS landing page and app.

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

## Operating sequence

1. Register an administrator, then sign in.
2. Create a store; it begins inactive until a license is approved.
3. Submit a bKash/Nagad license request with the sender number and transaction ID.
4. An administrator records approval using the license update API (a platform/super-admin interface can be added separately).
5. Create staff in the Shop → Staff Manager page. Staff sign in with Store ID, User ID and password.

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

# Cloudflare Pages no-install deployment (20 October 2026)

The supplied Cloudflare log showed Wrangler 3.114.17 failing to compile Pages Functions because the earlier ConnectX document-template editor imported `sanitize-html` without an installation step. The earlier interim archive vendored the sanitizer to fix that failure. **This newer App Store/ConnectX revision removes the document-template editor, its sanitizer import and the unused dependency altogether.** The site therefore continues to compile with **no project `node_modules` and no Pages build command**. Do not restore the old bare `sanitize-html` import or the retired HTML template editor from a previous archive.

1. Copy this *latest* archive into your EMS GitHub repository, commit and push it; Cloudflare deploys commits, not local ZIPs. Verify its build log refers to your new commit.
2. Cloudflare Pages may continue using output directory `.` with no build command. Wrangler 3.114.17 `pages functions build` was verified locally with the EMS `node_modules` directory moved away; it reported **Compiled Worker successfully**.
3. Apply migration 064 for per-shop email settings if it remains outstanding; apply migration 065 for App Store presentation metadata on existing PostgreSQL, or their corresponding D1 migrations. See `APP_STORE_CONNECTX_REVISION.md` for the order and fresh-database guidance.
4. Verify Brevo sender authorization and test email/SMS from an authorized non-production shop. No production changes were made here.

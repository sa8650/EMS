# ConnectX SIM Balance — owner setup and migration

ConnectX v1.6.0/build 17 displays the balance on the **SMS page** for the **selected SMS-sending SIM only**. It detects Android's SIM MCC/MNC (or, when unavailable, the exact carrier name), fetches the matching owner-managed configuration from EMS, and makes **one USSD request only when the user taps Refresh**. The APK contains no carrier dial strings. Unsupported, denied, timed-out, negative, ambiguous, or unparseable results say **“Balance unavailable”** rather than showing a guessed amount. The SIM number is masked when Android makes it available.

**SMS quota has been removed** from the Android app, parser, device response, EMS owner carrier editor, and current database schema. Regular customer SMS dispatch and the **Settings → Send a Test SMS** action are unaffected. Administrator Profile and test SMS remain in Settings, not on the dashboard.

## Upgrade an existing EMS deployment

**Back up the database before the migration.** The quota-code and quota-pattern values are deliberately deleted; existing carrier rows, MCC/MNC, balance USSD codes, balance patterns, and active status are retained. No database is modified just by reading this file; run the SQL on your own deployment.

- **Supabase PostgreSQL that already ran migration 043:** apply `supabase/migrations/044_connectx_balance_only.sql`. The 044 migration is safe to re-run. For a new Supabase database, run the numbered migrations in order (043 then 044). **Do not edit or replace an already applied 043 migration.**
- **Cloudflare D1 database that already has the two-code `connectx_sim_carriers` table:** run `supabase/d1/migration_connectx_balance_only.sql` **once**. SQLite's DROP COLUMN is not idempotent; running it twice fails. Confirm the backup before applying. If the carrier table is not yet present in your existing D1 database, run `migration_connectx_sim_carriers.sql` first, then `migration_connectx_balance_only.sql` once.
- **Fresh Cloudflare D1 database:** `supabase/d1/schema.sql` already defines the **balance-only** carrier table. Do **not** run either standalone carrier migration against it.

**For a deployment still using the old two-code carrier catalog:** a signed build **17** can first be tested on that EMS version because it ignores extra quota fields. Update build-15 phones before migrating carrier columns/deploying the balance-only API to minimize their interruption; build-16 phones are already balance-only. Back up and run the schema migration, then deploy the current EMS Functions and frontend. Older build-15 phones may show “Balance/Quota unavailable” after the switch. **Do not make build 17 mandatory until its signed APK is tested.** An App Store text preset does not create or upload an APK. The new email history also needs the matching EMS API; see [APP_STORE_RELEASE.md](APP_STORE_RELEASE.md).

## Configure a carrier (platform owner only)

1. Open **EMS platform owner → SIM balance**. Shop administrators cannot edit or list the carrier catalog; public visitors cannot read dial codes. Only an authenticated, non-revoked ConnectX device receives its matching active balance profile at `GET /api/connectx/gateway/sim-carrier`.
2. On the phone, select the correct sending SIM and find its **SIM MCC/MNC** under the SMS page balance card when unsupported. Enter all 5–6 digits including leading zeros. If Android cannot provide an MCC/MNC, use the exact carrier name shown by Android as **Carrier identifier**. An exact numeric match takes precedence over any name fallback. Two identifier-only records with the same normalized name are rejected.
3. Obtain the **actual balance USSD code** from the carrier or its verified documentation. Dial codes may incur charges or change services: never guess. Enter just the verified `*...#` dial string. Keep the record inactive until confirmed; **Active** requires one valid balance code. No records or codes are preloaded.
4. For replies without a clear Balance or currency label, optionally enter a **Balance response pattern** with capture group 1 around the *entire amount*. Example of response formatting (not a dial code): `Balance: ([0-9.,]+)`. Avoid complex nested repeated groups. The parser rejects partial numbers, ambiguous separators and multiple different balances; try it on a real response. Raw USSD replies and queried amounts stay on the phone and are not sent to EMS.
5. Tap **Refresh** on the ConnectX SMS page card. This re-reads the owner catalog, requests `CALL_PHONE` permission only if a matching active profile exists, and calls Android `TelephonyManager.createForSubscriptionId(...).sendUssdRequest(...)` for that selected subscription. No background SMS or update worker calls USSD. Android/carrier restrictions may still prevent the query.

## If “Balance unavailable” appears

Check the EMS URL/connectivity, migration deployment, device registration, selected SIM/MCC-MNC, carrier record's **Active** flag and verified balance code, and the Phone/Call permission requested by Refresh. Try the carrier's code on that *specific* SIM to inspect its actual response; if it is interactive or unlabeled, set a safe capture pattern in EMS. Android often hides the SIM phone number; showing **Not available** for the number is not an error. Never assume a displayed example amount is real data.

## Release and verification

`ConnectX/app/build.gradle.kts` now declares **versionName `1.6.0`, versionCode `17`**, package `com.ems.connectx`. Build/sign a new APK using the same certificate as the installed ConnectX app (build 15 or 16); verify package/version/build and signing certificate before **EMS owner → App Store → Upload New APK File**. Never rename an unsigned or older APK and treat it as a signed update. See `ConnectX/BUILD_ANDROID.md` and `EMS/APP_STORE_RELEASE.md`.

Locally the EMS API integration tests, SQLite D1 upgrade/fresh-schema checks, and Android Gradle compile/unit tests/lint have been run. This is **not** a live EMS deployment or proof of balance retrieval from your carrier; a physical supported phone/SIM and your verified carrier response are still required.

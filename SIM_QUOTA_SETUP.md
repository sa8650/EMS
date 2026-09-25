# ConnectX SIM Balance & SMS Quota — setup and safety

This is an **owner-managed, empty-by-default** carrier catalog. No operator codes are bundled in the Android APK or guessed by the server. ConnectX displays the selected SMS-sending SIM's carrier/number, reads only that carrier's active configuration from EMS, and dials its codes **only when the user taps Refresh**. Administrator details, Last SMS Activity, and the dashboard Test SMS button were removed; Administrator Profile and Send a Test SMS remain under **Settings**.

## Deploy EMS first

1. Deploy the revised EMS Pages Functions and frontend together.
2. Apply the new database migration before opening the carrier editor:
   - **Supabase PostgreSQL:** `supabase/migrations/043_connectx_sim_carriers.sql` (run once). RLS restricts direct client access; the EMS server accesses the table with its service-role key.
   - **Existing Cloudflare D1 database:** `supabase/d1/migration_connectx_sim_carriers.sql` (safe to run again; creates only the new table and index).
   - **Fresh D1 database:** `supabase/d1/schema.sql` already includes the carrier table; do not apply the standalone migration as well unless necessary.
3. Sign in to EMS as the **platform owner** (homepage **EMS login**). Open **SIM carriers** in the owner sidebar. Shop administrators cannot edit or read the full catalog; only registered, non-revoked ConnectX devices can retrieve the matching *active* carrier's configuration via `GET /api/connectx/gateway/sim-carrier` with their device token. The public App Store does not expose these codes.

## Configure an operator (do not guess its USSD codes)

1. Insert the SIM in the phone, select it as the SMS-sending SIM in ConnectX, and read its **SIM MCC/MNC** (shown on the dashboard while the carrier is not configured). Prefer these 5–6 digits including leading zeros. If Android does not provide them, enter the exact carrier name Android shows in **Carrier identifier** instead. Carrier names alone are not used to override a conflicting MCC/MNC.
2. Confirm the actual **balance** and **remaining SMS quota** dial strings with the carrier or by testing their official instructions on that SIM. USSD requests may have a charge or change account services. Enter them in **Balance USSD code** and **SMS quota USSD code** in the owner form. Do not enter unverified codes or personal numbers. The editor rejects URLs/text and requires strings in `*digits#` / `*digits*digits#` format.
3. Enter the carrier's display name and, if necessary, **optional response patterns**. Each pattern must have **capture group 1** around the numeric result. Examples for *response formatting only* (these are not carrier codes): `Balance: ([0-9.]+)` and `SMS: ([0-9]+)`. If no pattern is set, ConnectX cautiously parses explicit Balance/SMS labels; it never interprets an unlabeled promotional or phone number as money/quota. If a carrier returns an interactive menu, ambiguous numbers, or a format your pattern cannot parse, the value remains unavailable. Patterns are tested on the phone against the response; USSD reply text is not sent to EMS.
4. Save the row **inactive** while testing its identity and codes, then switch **Active** on once both codes are confirmed. Inactive rows and rows missing a code are never sent to ConnectX. You can later edit/disable/delete a carrier from the same owner page. Changes are read on the next dashboard visit or tap of Refresh; no new APK is required just to update codes.
5. **No carrier entries are prefilled.** Until you add verified records, the card correctly says **“Balance/Quota unavailable.”** The numeric examples in the user request are illustrations, not real account data.

## Build/install ConnectX

1. The revised source specifies **versionName `1.5.0`, versionCode `15`, package `com.ems.connectx`** in `ConnectX/app/build.gradle.kts`. These are source settings, **not** proof that a signed APK was built or uploaded. If build 15 is already installed or published, **increase the build code above 15** and publish metadata matching that actual APK.
2. Build a **release-signed APK with the same key** as the already installed build-14 app (`ConnectX/BUILD_ANDROID.md`). Check its embedded package/build with Android Studio APK Analyzer before uploading it to EMS App Store. Renaming a build-14 APK does not make it build 15.
3. The APK adds `CALL_PHONE`, requested **only after a supported SIM's Refresh is tapped**; allow it to use Android's `TelephonyManager.sendUssdRequest` (Android API 26+). Existing `READ_PHONE_STATE` is used to identify active SIM subscriptions. SMS sending and settings do not require the additional USSD permission. Android or the carrier may still reject programmatic USSD; this feature does not bypass that restriction.
4. Select the intended sending SIM (Dashboard SIM card or Settings → Switch Sending Number). Open the dashboard's **SIM Balance & SMS Quota** card and tap **Refresh**. The app re-reads EMS's current carrier configuration, targets the selected **subscription ID** rather than the default SIM, requests balance and SMS quota (one USSD call if both codes are identical), and shows values only if the reply can be parsed reliably.

## If you see “Balance/Quota unavailable”

- Check the phone's working EMS Website URL, connectivity, device registration, and that the EMS migration/deployment are live; a 401/403 or missing table will not produce balances.
- Ensure the SIM you selected for *this shop* is installed and active; do not assume the phone's default calling SIM is the same. An unavailable Android SIM number displays **Not available** rather than inventing one.
- Match the SIM MCC/MNC exactly, including leading zeros. For identifier-only records, match Android's carrier name exactly; keep **Active** on and both verified USSD codes filled.
- Grant **Phone/Call** permission when Refresh requests it. If Android/carrier returns a USSD failure, the request times out, or the reply is interactive/unparseable, the app shows unavailable instead of fabricating a balance. Confirm codes and response formatting *on the target phone/carrier*; adjust optional capture patterns in EMS when appropriate.
- Refresh is manual: neither the background SMS worker nor update scanner dials USSD. EMS stores carrier configuration only, not your SIM balance/quota or raw USSD reply.

## What was validated here

The EMS API integration tests exercise owner-only create/edit/delete, invalid dial strings, active/inactive matching, denied public/admin access, revoked device behavior, and identifier fallback. Pure Kotlin unit tests exercise reply parsing and reject unlabeled/ambiguous data. **Full Android build and live SIM/USSD operation cannot be verified in this workspace** without the Android SDK, your original signing key, actual carrier codes/response samples, and a physical phone/SIM. These requirements are necessary before claiming live balances work.

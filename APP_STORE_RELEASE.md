# EMS App Store — publish ConnectX v1.6.0 / build 17

**ConnectX: Central Communication Gateway powered by Dexter Studio** now has an SMS page and a read-only Email page for each paired shop's **outgoing** EMS ConnectX history. Dashboard shows both SMS and email activity. The Android launcher label remains the shorter **ConnectX**; the Android package ID remains `com.ems.connectx` for in-place updates.

The source in this workspace declares **versionName `1.6.0`, versionCode `17`**. **No signed build-17 APK was created, installed, or uploaded in this workspace.** Updating App Store text or renaming an APK does not modify the app inside it.

## Safe release order

1. **Deploy EMS first:** update the EMS Cloudflare Pages Functions, especially `functions/_lib/connectx_sms.js` and `functions/api/[[path]].js`, to provide the device email endpoints. The existing `connectx_messages` table stores outgoing email, so **no new email migration is needed**. Email composition/sending and provider credentials remain on EMS. Older Android clients still use the existing SMS gateway routes. If the earlier **balance-only carrier migration** has not been applied, follow [SIM_BALANCE_SETUP.md](SIM_BALANCE_SETUP.md) separately and back up before deleting old SMS-quota columns.
2. **Build/sign on your computer:** open `ConnectX/` in Android Studio with JDK 17 and Android SDK 35. Use **Build → Generate Signed Bundle / APK → APK → release** with the **same keystore, alias, and signing certificate as the ConnectX build currently installed on your phone** (build 15 or 16, as applicable). Find the signed output via Android Studio's **Locate** link. If the Build menu is hidden, open the ☰ main menu or search **Generate Signed** with Ctrl+Shift+A / Cmd+Shift+A. **Do not upload `app-release-unsigned.apk`; renaming it will not sign it.** Keep keystores/passwords private.
3. **Verify the APK itself:** inspect it with Android Studio's Analyze APK or Android SDK tools. It must contain package `com.ems.connectx`, **v1.6.0 / build 17**, and a signing certificate matching the installed app. Android will reject a different signing key. A phone already running build 17 needs a newer build code for its next update.
4. **Publish a real binary:** EMS platform owner → App Store → Update App → use the ConnectX quick preset (or enter the full title, version name `1.6.0`, code `17`, description and release notes). Select **Upload New APK File**, choose the verified signed build-17 file, and save/publish after the binary upload succeeds. A suitable honest filename is `ConnectX-v1.6.0-build17.apk`. **Quick Preset edits metadata only; it does not create, sign or upload an APK.** Start as an optional release until tested on a compatible phone.
5. **Test on a phone:** in a private browser window confirm `/?page=app-store` downloads the published APK without EMS login; verify Settings → About & Updates displays installed **v1.6.0 / build 17** after the update. On the selected shop, test the SMS history, SIM switching, a *manual* balance check with a real SIM, dashboard counters, paginated email history and an email detail. Switch shops and confirm email records never carry over. Revoke a test device on EMS and confirm it loses email access. Only then consider a mandatory rollout.

**Email scope:** this release displays outgoing EMS `connectx_messages` records for the selected shop (sent, failed, queued and sending). It does **not** fetch inbound Gmail/Brevo mail or let the phone send email. Shop-hidden email records remain hidden on the phone; EMS owner logs are separate. The email body is fetched only when opened and rendered as inert text, including document contents when stored by EMS.

## Troubleshooting

- **Email page says unavailable / 404:** deploy the matching EMS API first; ensure the selected shop has a registered **active** paired device and its administrator/shop are active. The app never reads email from another selected shop or from a public endpoint. Existing EMS email records must exist for the page to show any messages.
- **Balance unavailable:** check the selected SIM and the owner-managed catalog in [SIM_BALANCE_SETUP.md](SIM_BALANCE_SETUP.md). Reading email does not require a SIM balance query; only tapping Refresh initiates USSD.
- **APK unavailable / 503:** configure EMS R2 storage (`APP_STORAGE` or `VAULTIUM`) and verify the uploaded object, or publish an HTTPS-hosted accessible APK. A draft can remain unpublished while fixing storage. Do not advertise a nonexistent GitHub release or private/login-only URL.
- **App not installed:** inspect embedded package/version/signature, not the APK filename. Never uninstall a working app to bypass a signing mismatch; local SMS state and pairing may be lost. `adb install -r signed.apk` can give a detailed installer error; compare certificate fingerprints with `apksigner verify --print-certs`.
- **Check-update says no update:** the advertised build must be strictly newer than the installed build, have *new* matching APK bytes, and be published. Editing the title/filename alone cannot trigger an Android update.

The public App Store check/download endpoints are anonymous; uploading/publishing is **platform-owner only**. Example checks (replace the hostname with your real EMS domain):

```bash
curl -sS 'https://YOUR-EMS-DOMAIN/api/app-store/apps'
curl -sS 'https://YOUR-EMS-DOMAIN/api/app-store/check-update?package=com.ems.connectx&versionCode=16'
curl -I 'https://YOUR-EMS-DOMAIN/api/app-store/download/com.ems.connectx'
```

A genuine build-17 release should offer an update to build 16 (and build 15). Local tests and Gradle builds do **not** prove a live Cloudflare deployment, Brevo send, SMS delivery or install on a physical phone.

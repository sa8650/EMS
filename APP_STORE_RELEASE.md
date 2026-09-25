# EMS App Store — publish a real ConnectX update

The owner reports a working installed **ConnectX v1.5.0 / build 15**. The **source** in this workspace now declares **v1.5.1 / build 16** (`com.ems.connectx`) to make a balance-only update installable over build 15. **No build-16 release APK has been signed, installed, or uploaded in this workspace.** Editing EMS version text or renaming an APK does not change its embedded version or digital signature.

## Before publishing build 16

1. Plan and **back up** the carrier database for the **balance-only migration** in [`SIM_BALANCE_SETUP.md`](SIM_BALANCE_SETUP.md); it deletes old SMS-quota code and pattern values while preserving carrier rows and balance settings. For minimal interruption, you can sign/test build 16 against the *current* two-code EMS API first (the new Android app ignores the extra response fields), update phones, then run the migration and deploy the new EMS carrier API/editor. If EMS is switched first, an old build-15 phone may temporarily show unavailable.
2. On the computer that signed your currently installed app, open the `ConnectX` project (folder containing `settings.gradle.kts`) in Android Studio. Use **Build → Generate Signed Bundle / APK → APK**, select `release`, and use the **same signing certificate/keystore and key alias as build 15**. If the Build menu is hidden, open Android Studio's ☰ menu or search for **Generate Signed** using **Ctrl+Shift+A** (Windows/Linux) or **Cmd+Shift+A** (Mac).
3. Use Android Studio's **Locate** link to find its *signed* output. **Do not upload `app-release-unsigned.apk`**—adding a new filename does not sign it. Inspect the produced APK (Build → Analyze APK or the SDK `aapt`/`apksigner` tools). Confirm its embedded package `com.ems.connectx`, version `1.5.1`, version code `16`, and a certificate matching the installed build-15 APK. A new signing key cannot install over that app. Do not share keystores or passwords.
4. Sign in as the **EMS platform owner → App Store → Update App**. Set Version Name to `1.5.1` and Version Code to `16`, choose **Upload New APK File** and select the verified signed file. Enter an honest download filename, for example `ConnectX-v1.5.1-build16.apk`, and describe the balance-only change. Publish only after the binary upload succeeds. The **Quick Preset only fills text fields**; it cannot build or upload an APK. **Do not make the update mandatory until it is tested on a compatible build-15 phone.**
5. In a private browser window, verify that `/?page=app-store` offers **Download APK** and the file downloads without an EMS login. Test the in-app update on a build-15 device, and verify Settings → About & Updates displays **v1.5.1 / build 16** after installation. Test the balance card separately with a real selected SIM and verified carrier settings.
6. After updating the phones, apply the balance-only database migration and deploy the revised EMS carrier API/editor together. On D1 the existing-database migration runs **once**; on Supabase run migration **044** after 043. The revised owner page is **SIM balance** and keeps one verified balance code per carrier.

The public App Store and check/download APIs are anonymous, but uploading and publishing are **platform-owner only**. EMS R2 must be configured (`APP_STORAGE` or `VAULTIUM` binding). A working HTTPS-hosted APK URL is an alternative; avoid nonexistent GitHub releases, repositories, or login-protected URLs. If saving a published release says **APK not available**, verify the storage binding/object or external URL; a draft may be kept unpublished while fixing it.

## Update versus metadata-only change

- **Actual update:** version code strictly increases, the APK bytes are replaced with a new file, package ID remains `com.ems.connectx`, and Android's signing certificate matches the installed app. Build 16 can update build 15; an already installed build 16 would require a still-higher code.
- **Metadata/filename change:** editing title, notes, icon or APK Download Filename without uploading a new binary does **not** change the version embedded in the APK or trigger an Android update. Existing code rejects increasing the advertised build while keeping the same R2 object/URL.
- If a file called `app-release-unsigned.apk` was simply renamed to `ConnectX-v1.5.1-build16.apk`, Android will reject it even though EMS successfully downloads it and unknown-app installation permission was granted. Use the Android Studio signing wizard with the existing key; the final installer checks the signature.
- Do not uninstall the working app just to bypass a signing failure: pairing and pending local SMS state could be lost. Diagnose with `adb install -r your-signed.apk` if Android only says “App not installed”; inspect the resulting error and compare the certificate SHA-256 fingerprints with `apksigner verify --print-certs` on both APKs.

## Verify EMS without an admin token

Replace the example hostname with your actual deployed Pages/custom domain:

```bash
curl -sS 'https://YOUR-EMS-DOMAIN/api/app-store/apps'
curl -sS 'https://YOUR-EMS-DOMAIN/api/app-store/check-update?package=com.ems.connectx&versionCode=15'
curl -I 'https://YOUR-EMS-DOMAIN/api/app-store/download/com.ems.connectx'
```

After a genuine published build-16 release, the check-update response for installed build 15 should say `hasUpdate: true`, and an R2 download should return HTTP 200 with `Content-Type: application/vnd.android.package-archive`. An external APK URL may return 302; follow its final host. A 404 means no published release, 503 means an advertised APK is unavailable, and a DNS error means the phone's saved EMS URL is wrong. Do not interpret any of those errors as “up to date.”

Locally, the EMS API tests run with mocked database/R2 services and do not prove a live Cloudflare/R2 deployment. Android Gradle compile, unit tests and lint have run for this source, but signing, installing and real carrier checks require the owner's original signing key and a physical phone/SIM.

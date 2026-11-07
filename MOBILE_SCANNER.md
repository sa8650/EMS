# EMS Mobile Scanner — Pharmacy and Electronics

The Scanner is an **installable PWA** in the existing EMS site, not an APK, a hosted service, or a second billing system. The App Store **installation QR** opens `/scanner/`; the separate **▣ Scanner** button in the Pharmacy or Electronics PC header generates a 60-second, single-use **sign-in QR**. Sign-in does not select an invoice. Shop-account sign-in also remains available. Scanner sessions expire after 20 minutes. TrueBill is available independently to all users and guests.

## Upgrade and installation

1. For existing PostgreSQL installs, apply `supabase/migrations/061_mobile_scanner.sql`, `062_mobile_scanner_purchase_login.sql`, then **`063_scanner_electronics.sql`** in that order. For D1 installs, apply `supabase/d1/migration_mobile_scanner.sql`, `migration_mobile_scanner_purchase_login.sql`, then **`migration_mobile_scanner_electronics.sql`**. Fresh installs can use the updated matching complete schema. Apply migrations **before** deploying this code. These changes use the existing database, Cloudflare Pages Functions and `SESSION_SECRET`; this archive has **not been deployed**.
2. In either existing App Store, open `/scanner/` or scan its **installation** QR. Android/Chrome: Install app; iPhone/Safari: Share → Add to Home Screen. The app has a scoped service worker, which caches only public shell assets. API responses, session data and sign-in tokens are never cached. HTTPS and browser camera permission are required for scanning.
3. Sign in on the phone with Shop ID/User ID/password, or open the shop PC's permanent header **▣ Scanner** button and scan its one-use QR with **PC QR code → Scan sign-in QR**. The older `#pair=` QR is retired. The sign-in QR never opens a bill, and a bill QR never acts as an installation QR.
4. Open a PC **sale or purchase** invoice and keep it open. Pharmacy uses its existing POS and Receive purchase form. Electronics uses its existing Sales invoice page and Purchase invoice modal. On the phone, explicitly select the active sale or purchase PC draft. Browsing the catalog without a selected draft remains read-only; sending a scan requires an authorized active draft. Multiple counters and shops remain separate.
5. For Electronics, the item's existing **item code** is the scannable/printable code; search also finds items by description. Scanner does not create inventory items. For a scanned **purchase** item, choose a supplier on the PC first and explicitly enter its buy price on the scanned line before saving: the system does **not** silently treat an unknown buy price as zero. For sales, the existing sale price and available stock apply. Pharmacy keeps its existing unit and pricing rules.

## TrueBill

“Verify an invoice” has been removed from signed-in Scanner **Home**, but the separate **Verify** tab, guest verification entry and public TrueBill access remain. Scanning an invoice TrueBill QR shows full details through the existing token route. Entering a printed `PUR-...` or `SAL-...` number shows only a **limited, non-private result** (found/not found and record type). It never reveals customer, shop, items, amounts, private codes or internal IDs from an enumerable number.

## Scan and save safety

- The PC normally checks for scans about every **350 ms** while visible; after it receives pending items it checks again sooner. The phone's own poll is adaptive (see **Speed and connectivity**): about every **180–700 ms** while an item is waiting for the PC, **1.2–4 s** when idle, and paused entirely while the tab is hidden. The phone says **On its way** until the existing PC form applies the item and acknowledges it, then **Added**; rejected events are **Not added**. Each event has a stable UUID for retry, while intentional repeat scans create new events. Offline scans are not silently queued.
- Each call checks shop, user, permissions, binding, terminal, draft type/status and expiry. Event insertion and prepare-save serialize on the draft. Temporary Scanner events never create official invoice, stock or report entries. Only the existing Pharmacy checkout/purchase endpoints and existing Electronics invoice-posting RPC create official records. Electronics adds an atomic per-shop save-key mapping, so retried invoice saves cannot post the same stock twice. Saving pauses scans; a confirmed failure may resume, while an uncertain result remains locked pending verification. Closing/clearing an uncommitted form cancels the temporary draft; unload cancellation is best-effort and stale drafts also expire.
- A failed Vaultium attachment upload after an invoice has saved is reported separately; it does not invite a duplicate invoice save. Existing invoice and stock operations remain authoritative.

## Speed and connectivity

The phone talks to the shop PC through one small layer (`scanner/link.js`), so the request pattern is decided in one place instead of being spread across the screens.

- **One poll, one request.** A poll cycle asks `scanner/drafts/:id/sync` once and that answer carries the draft state, the binding state and every event status. The previous cycle asked `/status`, `/sync` and `/events` separately.
- **Adaptive cadence.** The phone measures its own round-trip time and polls accordingly: roughly one poll per round trip while an item is in flight (floor 180 ms, ceiling 700 ms), and lazily (1.2–4 s) when nothing is waiting. Failures back off exponentially with jitter, so two phones in the same shop do not retry in lockstep after a Wi-Fi hiccup.
- **Single flight.** A slow answer can never stack another request on top of it, and a hidden tab stops polling completely and resumes on focus.
- **No hanging screens.** Every request has a deadline enforced independently of `AbortController` (a stalled socket otherwise leaves `fetch` pending), and a timeout says so in plain words. Reads retry once on a transport failure; **writes never retry silently** — a scan carries its own idempotency key and the operator decides. A `4xx` is an answer, not a broken link, so it is never counted as a connectivity failure.
- **Offline is explicit.** `navigator.onLine` drives a visible badge, and nothing is queued silently.
- **Shell v7.** The service worker caches the whole module graph (`scanner.js`, `link.js`, `engine.js`, `ui.js`, both TrueBill modules, the decoder, the barcode library) and serves shell assets from cache while refreshing in the background; navigation is network-first with an instant cached fallback. API responses, sessions and QR tokens are still never cached.
- **Decoder warmed once.** On a browser without a native `BarcodeDetector` (every iPhone, some Androids) the decoder chunk is fetched during idle time after sign-in, so the first scan does not wait for 442 KB. It is skipped when native decoding exists.
- **Catalog cached in memory** for a minute and invalidated when the bound draft changes; re-opening the tab inside that window is a cache hit, not a request.

## Scanner quality

- **Two separate pipelines.** The item scanner asks only for linear symbologies (`code_128`, `ean_13`, `ean_8`, `upc_a`, `upc_e`, `itf`, `code_39`); the TrueBill/sign-in scanner asks only for `qr_code`. Mixing them is what made the old camera feel random.
- **Native first, bundled fallback.** `BarcodeDetector` when the platform has it, the bundled ZXing build when it does not — same picture-in/code-out loop either way, with a decode that is time-budgeted per device instead of one attempt per animation frame.
- **Torch, zoom and continuous focus** where the track supports them; the controls appear only when they work, and a failure is reported rather than pretended. Camera constraints request a 1280×720 rear view with continuous autofocus.
- **Repeats are deliberate.** Holding a barcode still fires once. The same code can be scanned again after the cooldown, or immediately with **Same again** — buying two of the same item is a real workflow.

## Interface

The screens use the Agent Bento Grid language from `DESIGN_SYSTEM.md` §2 — a six-column bento that collapses to a phone width, white tiles on the neutral canvas, ring shadows instead of 1px borders, gradient icon chips and one masked dot grid.

- **Mobile first.** Authored for 360–430 px portrait phones: 44 px minimum touch targets, 16 px inputs (no iOS zoom-on-focus), safe-area insets respected, and the scan view keeps the Start/Stop controls and the manual code field inside the viewport on the shortest phones tested (360×640). Landscape phones get a two-column scan view for counter-mounted use.
- **No leftover sub-copy.** A heading is never followed by a sentence that repeats it, and empty states are one line plus one action.
- **Toasts** replaced the inline message log: a stack above the tab bar (top of the screen in landscape), one toast per topic so a burst of scans does not pile up copies, errors announced assertively and dismissed only by the operator or by a later success for the same topic, and a smaller cap on short screens so they never cover the field the operator is typing into.

## Verification before production

`npm test` covers the D1 implementation and the scanner layer (`test/scanner-link.test.js`, `test/scanner-engine.test.js`, `test/scanner-ui-copy.test.js`, `test/scanner-ui.test.js`), including Electronics sale/purchase queues, shop/draft isolation, permissions, retry keys, save barriers, stock changes exclusively through invoice RPCs, duplicate sale-item stock checks, the phone UI, and TrueBill privacy. Fresh D1 schemas and the ordered D1 upgrade path were smoke-tested with SQLite foreign keys enabled. **PostgreSQL RPCs have not been executed against a live PostgreSQL instance**: apply migration 063 and exercise sale/purchase, repeat-save, and concurrent-scanner scenarios in staging before production. Also test camera permissions, install prompts and scanner QR sign-in on real iPhone and Android devices.

`node test/server.mjs 8788` (or `npm run serve`) plus `npm run audit:scanner` drives the real app in Chromium at three phone sizes and checks: one poll is one request, idle pacing, requests stopping while hidden, no overflow, the scan → pending → acknowledged labelling, catalog caching, the offline shell contents, and TrueBill privacy. `npm run shots:scanner` renders every screen at eight viewport sizes to `/home/user/shots/scanner`. No production data was modified by this delivery.

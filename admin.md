# Administrator Panel — Design System & Working Process

> **Scope of the redesign:** the Administrator Panel only. Skin only —
> logic, functions, routes, APIs and the database are untouched. The public
> website, the Owner Console and the Shop Panel are pixel-identical to what
> they were before (proved by byte-identical screenshots before/after).

The Administrator Panel ("admin console") is the workspace of a *business*:
the person or team that runs one or more shops on EMS. It has exactly six
pages — **Store Manage, Licenses, Premium Add-Ons, My profile,
Devices, HelpDesk** — plus the flows that hang off them (create/edit store,
shop capacity, enter-a-store, buy license, add-on cart & checkout, live chat
with the platform owner).

---

## 1 · Why a dedicated stylesheet

Before the redesign the admin console was themed by `assets/css/app.css`
through `.adminSidebar` overrides layered on top of the Shop Panel's shell.
That meant the admin console could never evolve independently and every
change risked the Shop Panel.

The redesign gives it its own design system in **`assets/css/admin.css`**,
scoped to `body.adm-on`, with all-new `adm-` class names that appear nowhere
in `app.css` — so old theme rules can never bleed in, and admin rules can
never leak out. Every legacy admin rule (sidebar overrides, store cards,
helpdesk, add-on grids, cart, capacity modal, plan catalogue…) was removed
from `app.css`; a rule-level diff proved that **zero non-admin rules were
lost or altered** in the process.

| File | Role |
|---|---|
| `assets/css/app.css` | Public website + Shop Panel theme (admin rules fully removed) |
| `assets/css/owner.css` | Owner Console design system (scoped to `body.ob-on`) |
| `assets/css/admin.css` | **Administrator Panel design system (scoped to `body.adm-on`)** |
| `assets/js/app.js` | One renderer; `adminHome()`/`adminPage()` build the admin shell |

Load order in `index.html`: `app.css` → `owner.css` → `admin.css`. The
`body.adm-on` class is added when an administrator signs in and removed the
moment they leave (enter-a-store, sign out), so the scope never overlaps
with the shop shell.

---

## 2 · VengeanceUI Agent Bento Grid — the design language

The same design language as the Owner Console — VengeanceUI's *Agent Bento
Grid* — with its own accent so the two consoles are distinguishable at a
glance:

| | Owner Console | Administrator Panel |
|---|---|---|
| Shell | `.ob` / `ob-` classes | `.adm` / `adm-` classes |
| Primary accent | violet `#8b5cf6` | **sky `#0ea5e9`** |
| Scope class | `body.ob-on` | `body.adm-on` |
| Theme key | `localStorage.ems.obTheme` | `localStorage.ems.admTheme` |

The essence of the system, applied consistently:

- **Bento cards** — 20px radius, hairline ring shadow
  (`0 0 0 1px line` + soft elevation), never chunky borders.
- **Canvas** — `#f4f4f5` light / `#0a0a0a` dark; cards are white / `#171717`.
- **Dotted-grid texture** on hero surfaces (16px cells, ultra-faint) and a
  45° hatch on empty states.
- **3D gradient chips** — `color-400 → color-600` vertical gradients with a
  `border` in `color-600` and layered inset highlights (top white glow +
  bottom inner shade) so they read as physical keys.
- **Tiny mono labels** — 8.5px, `letter-spacing:.14em`, uppercase,
  `font-family:var(--adm-mono)` (ui-monospace stack), always with a colored
  bullet or glyph.
- **Tabular numerals** — every figure (KPI values, prices, totals, usage
  counts) uses the mono stack so digits align across cards.
- **Minimal motion** — nothing animates except a 2.2s pulse on the
  HelpDesk live dot and 120–150ms background/color transitions on hover.

---

## 3 · Token architecture

### 3.1 Core tokens (light values → dark overrides)

```css
body.adm-on{
  --adm-bg:#f4f4f5;        --adm-card:#ffffff;      --adm-inset:#fafafa;
  --adm-text:#18181b;      --adm-muted:#71717a;    --adm-muted2:#a1a1aa;
  --adm-line:#e4e4e7;      --adm-line-strong:#d4d4d8;
  --adm-font:'Inter',ui-sans-serif,system-ui,sans-serif;
  --adm-mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --adm-sky:#0ea5e9;       --adm-sky-strong:#0284c7;
  --adm-focus:rgba(14,165,233,.35);
}
body.adm-on[data-adm-theme="dark"]{
  --adm-bg:#0a0a0a;        --adm-card:#171717;     --adm-inset:#101010;
  --adm-text:#fafafa;      --adm-muted:#a1a1aa;    --adm-muted2:#71717a;
  --adm-line:#27272a;      --adm-line-strong:#3f3f46;
}
```

The body itself is painted by the tokens
(`body.adm-on{background:var(--adm-bg)!important}` plus
`html:has(body.adm-on)`) so the legacy `app.css` canvas can never show
through, in either theme.

### 3.2 Tone system — 10 tones, light/dark variants

Every accent in the panel comes from one tone scale:

```css
body.adm-on{
  --adm-t-violet: #8b5cf6;   --adm-t-emerald:#10b981; --adm-t-sky:#0ea5e9;
  --adm-t-amber:  #f59e0b;   --adm-t-rose:  #f43f5e;  --adm-t-cyan:#06b6d4;
  --adm-t-lime:   #84cc16;   --adm-t-orange:#f97316;  --adm-t-fuchsia:#d946ef;
  --adm-t-teal:   #14b8a6;
}
```

and consumed as `adm-t-*` classes with per-theme tints:

| Tone class | Used for |
|---|---|
| `adm-t-violet` | Stores KPI, store-card identity |
| `adm-t-emerald` | Active stores, healthy status, license "Active" |
| `adm-t-sky` | ConnectX, chat bubbles (admin side), primary buttons |
| `adm-t-amber` | Read-only shops, pending payments |
| `adm-t-rose` | Inactive shops, destructive actions |
| `adm-t-cyan` | Zudo AI |
| `adm-t-lime` | Business Health |
| `adm-t-orange` | TrueBill scans |
| `adm-t-fuchsia` | Vaultium storage |
| `adm-t-teal` | Account/profile page |

### 3.3 What the primary accent is *not*

The legacy EMS blue (`#3975eb` gradients, `#eff6ff` info boxes, `#102a43`
ink) appears **nowhere** in the admin console. A computed-style audit
asserts this: table headers, `code` chips, inputs, H1s, buttons and modals
all resolve to Agent Bento Grid values in both themes.

---

## 4 · Shell architecture

```
body.adm-on
└── .adm                          grid: 264px | 1fr
    ├── .adm-side                 sticky sidebar (full height)
    │   ├── .adm-mark             brand: sky 3D gradient square + EMS V1
    │   ├── .adm-nav              2 groups, 6 buttons [data-admin-page]
    │   │   ├── group "Business"  Store manage · Licenses · Premium add-ons
    │   │   └── group "Account"   My profile · Devices · HelpDesk (+#ahbBadge)
    │   └── .adm-user             avatar chip + administrator name
    ├── .adm-main
    │   ├── .adm-top              sticky 56px topbar: page title, theme toggle
    │   └── .adm-page  (#page)    the active page
    └── (…) modals mount to body
```

- **Sidebar** — 264px, sticky, its own dotted-grid texture strip; nav
  buttons carry icon chips (12px radius) that invert to the tone gradient
  when active; the HelpDesk button carries the unread badge (`#ahbBadge`).
- **Topbar** — sticky, hairline bottom border, page title on the left
  (`#admTopTitle`), sun/moon theme toggle (`#admTheme`) and sign-out on the
  right. No decorative drawers, no breadcrumbs, no search in the topbar —
  the only search input in the console lives on Store Manage where it
  filters the store grid.
- **Theme** — `data-adm-theme="dark"` on `<body>`; persisted in
  `localStorage['ems.admTheme']`; read on boot; toggled by the topbar
  button. Pure token swap, zero layout change.

---

## 5 · Page patterns

Every page composes the same primitives — no page invents its own layout:

| Primitive | Class | Notes |
|---|---|---|
| Page header | `.adm-head` | kicker (mono, tone bullet) + h1 + description |
| KPI row | `.adm-kpis` + `.adm-kpi` | 4-up grid; tone chip + mono value + caption |
| Bento grid | `.adm-grid` | 6-col responsive grid of mixed cards |
| Store card | `.adm-storecard` | identity, shop-code chip, status badge, usage meters, actions |
| Plan card | `.adm-plan` | price (mono), feature list with on/off states, buy button |
| Add-on card | `.adm-addon` | icon art frame, blurb, price math, status/buy |
| Data table | `.adm-tw > table` | mono uppercase headers, hairline rows, hover tint |
| Panel | `.adm-panel` | titled section (history, purchases, composer) |
| Meter | `.adm-meter` | usage bar (ConnectX/Zudo/Health limits) |
| Badge | `.adm-badge` | status pill (tone-tinted background) |
| Chip | `.adm-chip` | 3D gradient key (KPI icons, shop codes, user IDs) |
| Empty state | `.adm-empty` | hatch texture + mono label |
| Loading | `.adm-load` | mono dots placeholder while a page fetches |

### 5.1 Store Manage (`stores`)

Four KPIs (stores · active shops · restricted · ConnectX shops) → search input →
**store cards** in a responsive grid. Each card: name + address, shop-code
chip, status badge, phone/email/site rows, license meters (shops in use,
ConnectX / Zudo / Business Health daily usage — tinted to their tone,
"not included" meters render hollow), TrueBill tag, and two actions:
**Edit** (store modal) and **Enter** (goto). Header actions: **Add store**
and **Shop capacity**.

- *Store modal* — name/address/phone/alt-phone/email/website +
  low-stock threshold (number). Create → `POST admin/stores`; edit →
  `PATCH admin/store/:id`.
- *Shop capacity modal* — one row per shop with an active / read-only /
  inactive / delete select, live count of active shops vs the license
  limit (`#capacityNote`), and a confirm → `POST admin/store-capacity`
  with `{choices:[{id,status}]}`.
- *Enter a store* — `POST admin/store/:id/goto`; the returned staff
  session is saved (with `adminAccess`), the admin session is stashed in
  `localStorage['ems.admin.return']`, and the Shop Panel opens. Its
  sidebar shows **Return to admin**, which restores the admin session
  exactly as it was.

### 5.2 Licenses (`licenses`)

KPIs (license status, expiry, shop allowance, purchases) → **plan cards** built by
`admPlanCard()` — price in mono (`Free` for zero-price plans), benefits and
entitlement features with on/off states (ConnectX/Zudo/Health/TrueBill/
Vaultium with real limits), buy button. Paid plans open a payment modal
(method, number, transaction id + payment instructions box); free plans
activate directly. Both `POST admin/licenses` with the exact original
payload shape. Below: the purchase/entitlement history table.

### 5.3 Premium Add-Ons (`addons`)

Catalogue of five add-on cards (ConnectX, Zudo AI, Business Health,
TrueBill, Vaultium) with the shared `addonArt()` frames, price math
(unit price × days, or GB-months for Vaultium), license-included ribbons
and status states (included / active until / pending / in cart / buy).
**Add to cart** opens the configuration modal (validity days, daily limit
or GB) with a live total; confirming docks a **sticky checkout panel**:
line items, coupon row (`GET addons/coupon?code=…`), payment method /
number / transaction id, discount + grand total in mono, and
**Confirm purchase** → `POST addon-checkout {items, payment_method,
payment_number, transaction_id, coupon}`. Below: purchase history table.

### 5.4 Account (`profile`)

Single card with the profile form: name, phone, address, email, and a
password field that is **omitted from the request when left blank** —
`PATCH admin/profile`.

### 5.5 Devices (`devices`)

KPIs (devices, stores, staff accounts, latest sign-in) + the sign-in activity
table: store, staff name with user-ID code chip, device (browser/OS),
last seen.

### 5.6 HelpDesk (`helpdesk`)

One continuous chat with the platform owner: message list (owner messages
left, admin messages right in sky gradient bubbles), mono timestamps,
unread badge in the page header and in the sidebar (`#ahbBadge` counts
owner messages unread), and a composer (`POST helpdesk {content}`).
Opening the page marks owner messages read (`PATCH helpdesk`).

### 5.7 Read-only / expired license notice

When `state.licenseExpired` (or read-only), a modal explains the state and
offers **View license plans** → `adminPage('licenses')`. Under
`body.adm-on` it renders with admin modal classes; for every other role it
keeps its original legacy markup (unchanged behaviour).

---

## 6 · Interactions & forms

- Modals (`.adm-modal` / `.adm-modalbox`) mount at body level, 20px box,
  10px inputs, closed with the × button. Forms live **inside**
  `.adm-modalbody` and submit via `form.onsubmit` — the same pattern as the
  Owner Console — so Enter works and payload construction is one function.
- Buttons: `adm-btn-primary` (sky 3D gradient), `adm-btn-soft` (inset),
  `adm-btn-danger` (rose gradient), `adm-btn-ghost`. Nothing else.
- Toasts, confirm dialogs (`window.confirm` for destructive capacity
  deletes), loading placeholders and error panels (inline, mono, rose)
  reuse the app's existing mechanisms — no new UX vocabulary.
- No decorative animations, drawers, popovers or carousels exist in this
  panel; every element maps to an API action or a data point.

---

## 7 · Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥1120px | Full layout: 264px sidebar, 4-col KPI, 3-col store grid |
| 960–1119px | KPI 2×2, store grid 2-col, bento grid tightens |
| <960px | Sidebar collapses to a top strip: brand + horizontal nav + user chip |
| <640px | KPI 1-col, store/plan/add-on cards single column, checkout stacks below, tables scroll horizontally inside `.adm-tw` |

No horizontal page overflow at any width (asserted at 390px).

---

## 8 · Working process (how the redesign was done)

1. **Inventory** — every admin route, render function, API call, form
   field, payload and localStorage key was extracted from `app.js` and
   written down as an integration contract *before* any code was written.
2. **Design tokens first** — core palette, 10 tones, mono stack, radii,
   ring shadows — then primitives, then pages. No page-level one-offs.
3. **New namespace** — all classes prefixed `adm-`; the shell builder
   became `adminHome()`/`adminPage()` with `body.adm-on` scoping; nothing
   legacy was reused visually (helpers like `lucide()`, `esc()`, `toast()`,
   `addonArt()` are shared code, not styling).
4. **Skin only** — every endpoint, payload, field name, `id` and
   `data-*` hook was preserved verbatim so the backend contract is
   byte-for-byte the same (see §9).
5. **Legacy extraction** — a CSS-aware parser removed every admin-scoped
   rule from `app.css` (whole rules, and admin selectors out of grouped
   rules) with a rule-level diff proving **zero non-admin rules changed**.
6. **Docs** — this file, plus README updates.

## 9 · Verification

- **jsdom render suite (91 checks)** — admin boot, all six pages, both
  nav groups, every modal (store create/edit, capacity, buy plan paid/
  free, add-on cart, checkout), coupon math, helpdesk send & mark-read,
  theme toggle persistence, enter-a-store → shop shell → return-to-admin;
  plus regressions: Owner Console renders unchanged, Shop Panel keeps the
  legacy `.shell.dash2` sidebar, public landing renders pricing.
- **jsdom action suite (16 flows)** — every admin write hits the original
  endpoint with the original payload: `PATCH admin/profile` (blank
  password omitted), `POST admin/stores` (numeric `low_stock_threshold`),
  `PATCH admin/store/:id`, `POST admin/store-capacity {choices}`,
  `POST admin/licenses` (paid + free shapes), `GET addons/coupon`,
  `POST addon-checkout {items,…,coupon}`, `POST helpdesk`,
  `PATCH helpdesk`, `POST admin/store/:id/goto`; owner license approval
  still works.
- **Chromium style audit** — computed-style assertions in light + dark:
  token canvases, 264px sticky sidebar, 4-col KPIs, 20px cards with ring
  shadows, 3D chip gradients, sky primary buttons, mono table headers and
  numerals, 8.5px kickers, sticky topbar/checkout, tinted badges and
  meters, no legacy bleed on `th/td/code/input/h1`, zero console errors,
  no overflow; mobile (390px): single column, horizontal nav, no overflow.
- **Pixel-diff proof of isolation** — screenshots of the public landing,
  Shop Panel dashboard and Owner Console pages (overview, licenses,
  helpdesk dark) taken from the code *before* and *after* the admin
  redesign are byte-identical (with a frozen clock and paused animations
  for determinism).

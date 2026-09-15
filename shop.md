# Shop Panel — Design System & Working Process

> **Scope of the redesign:** the Shop Panel (staff role) only. Skin only —
> logic, functions, routes, APIs and the database are untouched. The public
> website is pixel-identical to what it was before (proved by a byte-identical
> full-page screenshot against the pre-redesign build), and the Owner Console
> and Administrator Panel are untouched.

The Shop Panel is the workspace of a *store*: the staff members who run the
day-to-day operation. It covers **Dashboard, Suppliers, Customers, Inventory,
Purchases, Sales, Expense, Due Recover, Staff Manager (staff accounts,
permissions, attendance, salary), Report (+ Business AI Health), Settings**
and — when the administrator has purchased them and permissions allow —
**ConnectX, Zudo AI and Vaultium**. Navigation is permission-gated: each
staff member sees exactly the modules their permission sections allow.

---

## 1 · Why a dedicated stylesheet

Before the redesign the Shop Panel was themed by `assets/css/app.css` — the
original theme, layered with generation after generation of `!important`
overrides. That file styled *everything*: public site, panel shell, and a
dozen half-finished theme layers on top of each other.

The redesign gives the Shop Panel its own design system in
**`assets/css/shop.css`**, scoped to `body.shp-on`, with all-new `shp-` class
names that appear nowhere in `app.css` — so old theme rules can never bleed
in, and shop rules can never leak out. Every legacy shop rule (the old shell,
dash cards, due workspace, attendance, salary, report, health, ConnectX,
Zudo, Vaultium, settings, read-only notice…) was removed from `app.css`.

| File | Role |
|---|---|
| `assets/css/app.css` | Public website + shared document styles (`.invoiceprint*`, `.tablewrap`, `.printItems`, auth/public surfaces) — **all panel themes removed** |
| `assets/css/owner.css` | Owner Console design system (scoped to `body.ob-on`) |
| `assets/css/admin.css` | Administrator Panel design system (scoped to `body.adm-on`) |
| `assets/css/shop.css` | **Shop Panel design system (scoped to `body.shp-on`)** |
| `assets/js/app.js` | One renderer; `shopHome()` builds the shell, `page()` routes the 14 surfaces |

Load order in `index.html`: `app.css` → `owner.css` → `admin.css` →
`shop.css`. The `body.shp-on` class is added by `shopHome()` and removed the
moment the staff session leaves the shop view (admin return, sign out), so
the scope never overlaps with the other consoles.

One deliberate exception: the **invoice document** (`.invoiceprint` family)
keeps its shared classes, because the same markup is used by the public
TrueBill verification page and the print window. Only the modal *chrome*
around it is Shop theme.

---

## 2 · VengeanceUI Agent Bento Grid — the design language

The same design language as the Owner and Administrator consoles —
VengeanceUI's *Agent Bento Grid* — with its own accent so the three
workspaces are distinguishable at a glance:

| Console | Accent | Body class |
|---|---|---|
| Owner Console | violet | `ob-on` |
| Administrator Panel | sky | `adm-on` |
| **Shop Panel** | **emerald** | **`shp-on`** |

The essence: 20px bento cards with hairline ring shadows, white (light) /
neutral-900 (dark) cards on a neutral-50 / neutral-950 canvas, dotted-grid
and 45°-hatch textures, 3D gradient icon chips (400→600 steps with layered
inset highlights), zinc/neutral greys, tiny monospace uppercase tracking
labels, tabular numerals, and minimal motion.

---

## 3 · Token architecture

### 3.1 Core tokens (light → dark)

Defined on `body.shp-on` / `body.shp-on[data-shp-theme="dark"]`:

`--shp-bg #f4f4f5 → #0a0a0a` · `--shp-card #ffffff → #171717` ·
`--shp-inset #fafafa → #101010` · `--shp-side #fafafa → #0d0d0d` ·
`--shp-text #18181b → #fafafa` · `--shp-text2 / --shp-muted / --shp-muted2`
(zinc scale) · `--shp-line` / `--shp-line-strong` (hairlines) ·
`--shp-ring` / `--shp-ring-lift` (the signature card shadows) ·
`--shp-dots` / `--shp-hatch` (texture inks) · `--shp-overlay` ·
`--shp-focus` (emerald-tinted) · `--shp-primary #10b981` (emerald-500,
constant across themes).

### 3.2 Tone system

Ten semantic tones (`shp-t-*`): `emerald primary, amber, rose, sky, zinc,
violet, cyan` — each defining chip gradient stops `--shp-c1/c2/cb`
(400/500-600/700 steps) plus solid reference colors, with light/dark text
pairings. `shpTone()` maps business nouns to tones: sale→emerald,
purchase→amber, expense→rose, inventory→sky, everything else→zinc.

### 3.3 Dark mode

A topbar toggle flips `data-shp-theme="dark"` on `<body>` and persists to
`localStorage['ems.shpTheme']`; the choice is restored on the next
`shopHome()`. Every component reads tokens, so dark mode is a token swap,
not a second stylesheet.

---

## 4 · Shell architecture

```
body.shp-on
└── .shp (app grid: 264px sidebar + main)
    ├── .shp-side          sticky sidebar
    │   ├── .shp-brand     3D emerald mark + wordmark (branding-synced)
    │   ├── .shp-store     "Current shop" chip
    │   ├── .shp-nav       6 groups, permission-gated
    │   └── .shp-sidefoot  Return-to-admin (when entered as admin) ·
    │                      user chip · sign out
    └── .shp-main
        ├── .shp-top       breadcrumb (EMS · SHOP → page) + quick actions:
        │                  Zudo, Attendance, Vaultium, theme toggle
        └── .shp-page#page routed content
```

Navigation groups: **Overview** (Dashboard) · **Operations** (Suppliers,
Customers, Inventory, Purchases, Sales, Expense, Due Recover) · **Staff**
(Staff Manager) · **Insights** (Report) · **Tools** (ConnectX, Zudo,
Vaultium) · **Preferences** (Settings). Attendance and salary open from
Staff Manager, exactly as before. Quick-action buttons and nav items appear
only when the corresponding permission/add-on allows.

Shared render helpers (all `shp-` prefixed): `shpKpi`, `shpChip`
(gradient icon chip, `shp-chipic`), `shpBadge`, `shpTone`, `shpEmpty`,
`shpLoad`, `shpMeter`, `shpModal` (document modals). Page identity lives in
the topbar only (`EMS · SHOP → <page>`); pages render no local title or
subtitle — `shpHead()` now emits just the contextual action row when a page
has one (attendance/salary entry buttons, back buttons, the Recover button,
the salary month chip).

---

## 5 · Page patterns

- **Dashboard** — 4 KPI bentos (sales/purchase/expense/dues), a
  financial-chart panel with tone bars, a live activity table, and an SVG
  sales-trend chart (this month vs previous, growth chip).
- **Entities** (suppliers/customers/expense) — toolbar (add + search) over a
  `shp-tw` table with short-ID chips, action buttons; expense adds a live
  due calculation and Vaultium attachments.
- **Inventory** — filter chips (All/Active/Inactive/Low stock) + search;
  low-stock rows flagged `LOW`.
- **Invoices** (purchases/sales) — searchable table with due-row tint
  (`shp-rowdue`), a builder modal (party picker, one-row line editor —
  search · qty · price · Add item —, tax/discount/paid summary, attachment
  tray) and a document view modal that reuses the shared `.invoiceprint`
  markup with a TrueBill QR when enabled. The document modal scrolls in a
  single pane (sticky print actions).
- **Due Recover** — history table + recovery modal (due list 40% /
  recovery form 60%) listing open dues with a live "new due" preview.
- **Staff Manager** — staff table, account modal with a 16-module
  permission editor (pill per action), attendance page (slide toggles,
  bulk pick, saved records), salary workspace (staff list, profile KPIs,
  invoice form with advance/due handling, history).
- **Report** — summary tab (KPIs, bars, cash panel, profit), purchase/
  expense/… tabs reserved for the next update, and the **Business AI
  Health** tab (usage meter, generate → score, metrics, findings, leaders,
  recommendations).
- **Settings** — store details (key/value bento) + activity log tab.
- **ConnectX** — compose (contact datalist, CC/BCC revealed on demand,
  invoice attach), inbox with status chips, overflow menus, email viewer;
  sky-tone module branding.
- **Zudo** — narrow conversation rail with direct trash-icon delete (no
  overflow menus, no horizontal scroll), usage meter, welcome + prompt
  chips, chat with thinking animation; violet-tone branding.
- **Vaultium** — storage KPIs with usage bar, file table, preview modals.
- **Read-only / expired license** — `shp-notice` modal on entry; every
  mutating control is permission-disabled.

---

## 6 · Responsive behaviour

| Width | Changes |
|---|---|
| ≤1120px | KPI grids 4→2; report KPIs 2; salary 240px rail; due workspace single column |
| ≤960px | ConnectX/Zudo/attendance/salary → single column; conversation list becomes a scroller |
| ≤640px | KPI grids →1; report grid, key/value, form grids, summary grids stack |

`@media print` hides the sidebar/topbar and report controls, so browser
printing (and the report print button) outputs a clean document.

---

## 7 · Working process (how the redesign was done)

1. **Inventory** — extracted all 38 shop functions from `app.js` as a logic
   reference; catalogued every legacy shop class and built a keep-list of
   public/auth/shared classes.
2. **Theme** — generated `shop.css` from the proven admin core (tokens,
   tones, shell, tables, forms, modals, responsive, print) then authored the
   shop-specific sections (toolbar, dashboard chart + SVG trend, invoice
   builder, due workspace, permissions editor, attendance, salary, report +
   health, settings, ConnectX, Zudo, Vaultium, notice).
3. **Markup** — rewrote each shop function's templates to `shp-` classes,
   one block at a time, preserving every handler, API call, field name and
   API payload shape; spliced them back with a span-aware replacer
   (`node --check` after every pass).
4. **Cleanup** — stripped legacy shop CSS from `app.css` with a
   string/comment-aware, template-literal-aware rule pruner (compound
   selectors must have *every* class live; selector surgery keeps only live
   parts). Re-linked `shop.css` after `admin.css`.
5. **Restore** — a pixel-compare against the pristine pre-redesign build
   surfaced public rules that earlier cleanups had wrongly dropped; they
   were restored in original order, scoped with `:where(body:not(.shp-on)
   :not(.adm-on):not(.ob-on))` (zero added specificity) so the public site
   is pixel-identical **and** the new panels are immune.

---

## 8 · Verification

- **Render suite (jsdom, 26 checks)** — shell/nav/dashboard/every page
  renders with `shp-` structure; permission gating for limited and
  read-only staff; admin→shop→admin return; admin/owner smoke; a full
  legacy-class sweep after visiting every page (zero hits); zero unmocked
  API calls.
- **Action suite (jsdom, 14 flows)** — supplier/customer/inventory/expense
  CRUD, walk-in sales invoice with live math (subtotal/tax/discount/due),
  invoice view, due recovery, attendance save, staff create/delete with
  permissions, salary invoice, ConnectX compose/send/delete, Zudo chat,
  Vaultium delete, report date validation, invoice delete.
- **Browser suite (Chromium, 10 checks)** — public landing **byte-identical**
  to the pre-redesign build; shop style audit (emerald tokens, bento cards,
  tabular KPI grid, **zero old-palette colors** in any computed style under
  `body.shp-on`); responsive KPI grid 4/2/1; dark-mode tokens; 16 page
  screenshots (light + dark + health report); Administrator storegrid/plans
  3/2/1 regression; Owner Console smoke.
- Screenshots: `shop-panel-previews/`.

**Result: the Shop Panel now runs the same Agent Bento Grid theme as the
Owner and Administrator consoles — emerald edition — with a dedicated
`shop.css`, and not a single old-theme class or color remains in the shop
UI.**

---

## 10 · Skeleton loading system

Every async page and sub-panel in the Shop Panel now shows a **skeleton
placeholder** while its data loads, instead of a text spinner. The system is
shared by all three Agent Bento panels (Shop, Administrator, Owner) and lives
in two layers:

- **`assets/js/app.js`** — the `SKEL` builders (`SKEL.kpis`, `SKEL.table`,
  `SKEL.list`, `SKEL.msgs`, `SKEL.chart`, `SKEL.form`, `SKEL.kv`,
  `SKEL.cards`, `SKEL.toolbar`, `SKEL.chips`, `SKEL.trend`…), a per-page map
  **`SHP_SKEL`** that composes them into a page-shaped preview, and
  `skelFor(SHP_SKEL, page)` which the shop router paints into `#page` the
  instant a navigation happens — before the first `await`.
- **`assets/css/app.css`** — the shared `.sk*` rules (structure + shimmer).
  Colors are never hardcoded there; they read the `--sk-*` tokens that
  **`assets/css/shop.css`** maps onto the Shop Panel's own variables
  (`--sk-card: var(--shp-card)`, `--sk-base: 9% of --shp-text`, etc.), so
  skeletons automatically follow light **and** dark shop themes.

**Shapes mirror the real components** — bento radius (20px cards / 14px
tables), 15–16px paddings, 9–12px gaps, the 4→2→1 KPI grid breakpoints
(1120px / 640px), 31px table header rows, 36px body rows — so content swaps
in without layout shift (measured: skeleton KPI 274×108 vs real 274×110).

State contract (unchanged logic, only the loading face is new):
**loading → skeleton · loaded → real content · empty → `shpEmpty` ·
error → the existing catch panels.** No skeleton element survives load,
empty or error.

Sub-loaders covered inside pages: salary workspace (`#salMain`, including
the staff-switch reload), due-recover history + the recover modal due list,
customer-invoice modal (`#ciBody`), settings tabs, ConnectX inbox, Zudo
conversation list + opened conversation, and attendance. The shimmer is a
1.5s ease-in-out sweep that is disabled entirely under
`prefers-reduced-motion: reduce` (it degrades to static blocks).

Verification (all automated, `/home/user/.emstest/`): render 44/44
(`render-test.js`), actions 15/15 (`action-test.js`), browser 10/10
(`browser-test.js`) — including skeleton-visible-on-nav, no-leftover,
no-layout-shift, dark tokens, reduced motion and landing pixel-identity
vs the pre-change build.

---

## 11 · Dashboard motion

The Shop Dashboard (only) now has a choreographed entrance + live-chart
motion set, built on the panel's existing tokens and the Agent Bento Grid's
"minimal motion" character. Everything is scoped to marker classes that
only `dashboard()` / `salesTrendChart()` emit — no other page, panel or
component is affected.

**What animates (in order):**

| Phase | Element | Animation |
|---|---|---|
| 0 → .55s | KPI cards (`.shp-anim-kpis .shp-kpi`) | `shpRise` — fade + 10px rise, 60ms stagger per card |
| .22s | Chart + activity panels (`.shp-anim-panels > .shp-panel`) | `shpRise` |
| .25–.6s | Recent-activity rows (`.shp-anim-rows tbody tr`) | `shpFade`, 50ms stagger (first 8 rows) |
| .35–.59s | Financial-chart bars (`.shp-fbar-track i`) | `shpGrow` — scaleY from 0, origin bottom, 80ms stagger |
| .34s | Sales-trend section (`.shp-rise`) | `shpRise` |
| .45–1.55s | Current-month trend line (`.shp-tline`) | `shpDraw` — stroke-dashoffset draw-on (`pathLength="1"` normalization) |
| .9–1.05s | Prev-month line, areas, data dots | `shpFade` / `shpPop` (dots pop with a slight overshoot) |
| 0 → .62s | KPI numbers (`.shp-kpi-val`) | JS count-up in `dashboard()` — eased (`1−(1−k)³`), 90ms stagger, `money()` formatting every frame |

Plus a micro-interaction: KPI cards lift 2px on hover (`.18s ease`).

**Deliberate details:**

- The dashed previous-month line keeps its natural `stroke-dasharray:4 4`
  — `pathLength="1"` is added **only** to the solid current-month line, so
  the draw-on technique can't change the dashed line's designed look.
- `animation-fill-mode: backwards` (not `forwards`) everywhere except the
  line draw — after each animation ends the element returns to its natural
  styles, so the hover transform keeps working and nothing stays "stuck".
- The count-up parses only digits/dot from the rendered `money()` value and
  bails out if the element is disconnected mid-flight (fast navigation).
- **Reduced motion:** the entire CSS block lives in
  `@media(prefers-reduced-motion:no-preference)` and the count-up is gated
  on `matchMedia('(prefers-reduced-motion: reduce)')` — reduced-motion
  users get the fully-rendered dashboard instantly, with no dasharray
  side-effects.
- Verified end-to-end: render 45/45, action 15/15, browser 11/11 —
  including computed `animationName` checks for every effect, count-up
  settling to the exact formatted values (`240,000.00`), reduced-motion
  returning `none` everywhere, the no-layout-shift KPI measurement, and
  the public landing remaining pixel-identical.

---

## 12 · Round 2 refinements

**Brand skeleton (refresh fix).** The sidebar brand used to flash the
hardcoded "EMS V1 / powered by DoxTox" until `public/branding` resolved.
All three dashboard shells now render mini `sk()` bars in the brand slot
instead, and the branding fetch fills in the owner-set name on arrival
(with an `EMS V1`/`DoxTox` fallback if the fetch fails, so the shimmer
never runs forever). The public site and login page keep their static
defaults — only dashboards changed.

**Sidebar user merged into the store card.** The `div.shp-user` pill is
gone; the signed-in user (avatar initial + name) now lives inside
`div.shp-store` under a hairline divider, above the shop name's card.

**Zudo conversation list.** Titles ellipsize ("What are my …") with the
full title on hover via `title=""`; the delete control is an
always-visible 26px icon chip (inset background + hairline border) that
turns rose on hover. A duplicate `.m:hover` rule that neutralized the
rose state was removed.

**Table hover states (all three panels).** Row hover now uses a 7% text
tint (was 4%), hovered `td`s are promoted to `--text` color so text stays
high-contrast during the highlight, and `:active` bumps to 11% for click
feedback. Due rows use a 9% amber tint.

**Additional bento motion.** "Live" badge gained a blinking status dot
(`shpBlink`), KPI hover now lifts with a ring shadow + stronger border,
bento panels strengthen their border on hover, and financial-chart bars
lift 1px and brighten on hover — all inside the
`prefers-reduced-motion:no-preference` block.

Verified: render 51/51, action 15/15, browser 15/15 — including the
brand skeleton→fill lifecycle in all three panels, topbar-title + head
actions assertions, zudo icon visibility/ellipsis, and hover
background/td-color computed-style checks.

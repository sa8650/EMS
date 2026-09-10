# EMS Owner Console — Guide & Design System Documentation

This document explains the **EMS Owner Console**: what it is, how to use every
page, and — in full detail — how its independent **Agent Bento Grid** CSS
system works (layout grids, colors, theming, components and the complete
rendering pipeline from login to painted screen).

The Owner Console is intentionally a **separate product surface**: it has its
own stylesheet (`assets/css/owner.css`), its own design language, its own
light/dark theme engine — while the public website, Administrator Panel and
Shop Panel keep their original `app.css` look, completely untouched.

---

## Table of contents

1. [What the Owner Console is](#1-what-the-owner-console-is)
2. [How the console works (rendering pipeline)](#2-how-the-console-works-rendering-pipeline)
3. [Page-by-page reference](#3-page-by-page-reference)
4. [The design system — how owner.css works](#4-the-design-system--how-ownercss-works)
   - 4.1 [File isolation & load order](#41-file-isolation--load-order)
   - 4.2 [The theme engine (light/dark tokens)](#42-the-theme-engine-lightdark-tokens)
   - 4.3 [The color system](#43-the-color-system)
   - 4.4 [The bento grid layout system](#44-the-bento-grid-layout-system)
   - 4.5 [Cards, panels & the ring-shadow depth model](#45-cards-panels--the-ring-shadow-depth-model)
   - 4.6 [The 3D gradient chip, layer by layer](#46-the-3d-gradient-chip-layer-by-layer)
   - 4.7 [Textures: dotted grid & hatch](#47-textures-dotted-grid--hatch)
   - 4.8 [Typography system](#48-typography-system)
   - 4.9 [Component reference](#49-component-reference)
   - 4.10 [Motion](#410-motion)
5. [The CSS working process, end to end](#5-the-css-working-process-end-to-end)
6. [Customization guide](#6-customization-guide)
7. [Verification](#7-verification)

---

## 1. What the Owner Console is

The Owner Console is the command center for the **platform owner** — the
person hosting EMS for many businesses. It replaces the old owner panel
completely: same functionality, same API calls, entirely new UI.

**Entry:** open `/` → **EMS login** (owner credentials only). On the first
ever run, use *Initialize first EMS owner* from the same dialog. After login
the app detects `role === "owner"` and boots the console.

**Navigation** — a fixed sidebar grouped into five sections, 16 pages:

| Group | Page | What it's for |
|---|---|---|
| **Platform** | Overview | Live snapshot: administrators, shops, licenses, pending payments, activity |
| **Business** | License control | Approve / reject bKash·Nagad license payment claims |
| | License plans | Create/edit plans — duration, limits, add-on entitlements |
| | Administrators | Every business account; activate/deactivate, unlock |
| | Shops | Every store on the platform with license state |
| **Website** | Website branding | Product name, website name, "powered by", logo & landing art |
| | Website pages | Edit the fixed public pages (About, Terms, Contact) |
| | Blogs | Publish/edit/delete public blog posts |
| | Contact messages | Messages submitted from the public contact form |
| **Services** | ConnectX | Platform email service: sender identity, limits, test send, logs |
| | Zudo AI | Central AI model + daily limits, Business AI Health controls, logs |
| | TrueBill | Invoice QR verification: price/day, validity range, scan log |
| | Vaultium | Cloudflare R2 storage: usage per shop, setup instructions |
| | HelpDesk | Two-pane chat with every administrator |
| | Premium Add-Ons | Add-on catalogue setup, purchase approvals, coupons, payment info |
| **System** | Factory reset | Type-to-confirm destructive platform reset |

Everything is **functional, not decorative** — every card on screen maps to a
real number, queue or action; there are no purely ornamental elements.

---

## 2. How the console works (rendering pipeline)

The console is pure client-side rendering (no framework), spliced into
`assets/js/app.js`:

```
login (EMS login dialog)
  └─ POST /api/auth/ems/login          → session { token, role:'owner', user }
       └─ home()  sees role === 'owner' → ownerHome()

ownerHome()
  ├─ document.body.classList.add('ob-on')        ← turns the owner CSS system ON
  ├─ document.body.dataset.obTheme = saved theme (or OS preference)
  ├─ builds the shell: .ob > .ob-side (sidebar) + .ob-main (topbar + #page)
  ├─ fetches /api/public/branding  → product name, "powered by"
  ├─ fetches /api/platform/helpdesk → unread badge total
  └─ ownerPage('overview')

ownerPage(p)
  ├─ highlights the active nav button (class .on)
  ├─ updates the topbar title (#obTopTitle)
  ├─ paints a loading state  (obLoad)
  └─ dispatches to the page renderer:
       ownerOverview · ownerLicenses · ownerPlans · ownerAdmins · ownerShops
       ownerBranding · ownerWebsitePages · ownerBlogs · ownerContactMessages
       ownerConnectX · ownerZudo · ownerTrueBill · ownerVaultium
       ownerHelpdesk · ownerAddons · ownerFactoryReset
       (+ modals: planModal, blogModal, zudoLogModal, addonSetup)
```

**Data flow is unchanged from the old panel** — the same endpoints, methods
and payloads are used, e.g.:

| Action | Call |
|---|---|
| Approve / reject a license | `PATCH platform/license/:id {status:'active'\|'rejected'}` |
| Save a license plan | `POST platform/license-plans` · `PATCH platform/license-plan/:id` (entitlement booleans included) |
| Toggle an administrator | `PATCH platform/administrator/:id` |
| Save branding / pages / blogs | `PATCH platform/settings`, `platform/pages`, `POST/PATCH platform/blogs` |
| Configure services | `PATCH platform/connectx`, `platform/zudo`, `platform/business-health` |
| Add-on setup & purchases | `PATCH platform/addons`, `PATCH platform/addon-purchases` |
| Coupons | `POST/PATCH platform/addon-coupons`, `DELETE platform/addon-coupons?code=…` |
| HelpDesk | `platform/helpdesk`, `platform/helpdesk/conversation/:id`, `platform/helpdesk/send`, `platform/helpdesk/read` |
| Factory reset | `POST platform/factory-reset` (confirmation phrase required) |

**Markup helpers** (all defined once, reused everywhere):

| Helper | Output |
|---|---|
| `obHead(page, sub, action)` | Page header: group kicker + H1 + subtitle + action buttons |
| `obKpi(icon, tone, label, value, foot)` | One KPI bento card |
| `obChip(icon, tone)` | 3D gradient icon chip |
| `obBadge(text, tone)` | Status badge |
| `obMeter(used, limit)` | Usage meter + "x / y used today" |
| `obModal(title, inner, cls)` | Modal overlay with sticky head + close button |
| `obEmpty(msg)` / `obLoad(msg)` | Empty / loading states |

**Theme toggle:** the topbar sun/moon button flips `data-ob-theme` on
`<body>` and saves it to `localStorage` (`ems.obTheme`) — no reload needed,
the whole recolor is instant via CSS custom properties.

---

## 3. Page-by-page reference

**Overview** — four KPI cards (administrators, shops, active licenses,
pending verifications), a license-activity stacked bar (emerald/amber/rose),
the pending payments queue with one-click approval, recent platform activity
and quick links into the busiest pages.

**License control** — every license record with shop, plan, method, amount,
transaction ID and status. Pending claims show **Approve** / **Reject**;
approving activates the store immediately.

**License plans** — plan table + editor modal (name, price, duration, limits,
plus four add-on entitlement switches). Entitlements drive what shops can buy
and use.

**Administrators** — account list with short admin ID, email, store count,
active state; actions to activate/deactivate and unlock blocked accounts.

**Shops** — all stores with owner administrator, status and license state —
the at-a-glance health of the platform.

**Website branding / Website pages / Blogs / Contact messages** — the full
public-website CMS: identity strings and art; the fixed About/Terms/Contact
pages (with a "add missing standard pages" action); blog publishing with
cover images; and the contact-form inbox.

**ConnectX** — platform sender identity, per-day limits, a real test send,
and delivery logs.

**Zudo AI** — provider readiness cards (Workers AI / Gemini / Groq / Cerebras),
central model picker, global daily request limit, enable/disable, Business
AI Health controls, conversation logs (click a row → full transcript modal).

**TrueBill** — price per day, validity range, verification URL, and the scan
log (who verified which invoice, when).

**Vaultium** — total storage used, file count, and per-shop usage table
(limit / used / period / status) plus the exact Cloudflare R2 binding steps.

**HelpDesk** — two-pane workspace: administrator list with unread badges and
search on the left, continuous conversation with a composer on the right.

**Premium Add-Ons** — catalogue cards (ConnectX, Zudo AI, AI Business Health,
TrueBill, Vaultium) each opening its setup modal (pricing, allowed days and
daily limits); purchase-request approvals; payment instructions editor and
coupon manager (add / activate / deactivate / delete).

**Factory reset** — a clearly-marked danger zone; requires typing the exact
confirmation phrase, then `POST platform/factory-reset`.

---

## 4. The design system — how owner.css works

The design language is **VengeanceUI "Agent Bento Grid"** (shadcn/Tailwind
DNA). Its essence: neutral surfaces, bento cards with hairline ring shadows,
dotted textures, 3D gradient chips, monospaced numerals and tiny uppercase
tracking labels — professional light and dark treatments with minimal motion.

### 4.1 File isolation & load order

`index.html` loads exactly two stylesheets, in this order:

```html
<link rel="stylesheet" href="assets/css/app.css">   <!-- public + admin + shop -->
<link rel="stylesheet" href="assets/css/owner.css"> <!-- owner console only -->
```

`owner.css` contains **zero** global selectors. Every rule is prefixed with
`body.ob-on`, which only exists while an owner session is rendered:

```css
body.ob-on   { …design tokens… }             /* light theme            */
body.ob-on[data-ob-theme="dark"] { …tokens… } /* dark theme override    */
body.ob-on .ob-card { … }                    /* components             */
```

This means:

- **Public site / Admin Panel / Shop Panel can never be affected** — their
  markup never lives inside `body.ob-on`, so the entire file is inert for
  them. (Verified by pixel-diffing those surfaces before/after the redesign:
  byte-identical screenshots.)
- Conversely, `app.css` *does* contain some **global `!important` rules** for
  bare elements (`th, td, code, input, select, textarea, button…` — legacy
  skins for the other panels). Those hit owner markup too, so the owner rules
  that restyle those same elements deliberately answer with `!important` **and
  higher specificity** (`body.ob-on .ob th { … !important }`). This is the
  only reason `!important` appears in owner.css — it is defensive, not
  sloppy.

### 4.2 The theme engine (light/dark tokens)

All visual constants are **CSS custom properties declared on the scoping
root**. Light values are the default; the dark theme is one attribute flip
away:

```css
body.ob-on {
  --ob-bg:#f4f4f5;            /* page canvas  (zinc-100)   */
  --ob-card:#ffffff;          /* card surface             */
  --ob-inset:#fafafa;         /* inset / visual areas     */
  --ob-inset2:#f4f4f5;        /* deeper inset (chips, tracks) */
  --ob-side:#fafafa;          /* sidebar                  */
  --ob-text:#18181b;          /* primary ink   (zinc-900) */
  --ob-text2:#3f3f46;         /* secondary ink (zinc-700) */
  --ob-muted:#71717a;         /* muted ink    (zinc-500)  */
  --ob-muted2:#a1a1aa;        /* faint ink   (zinc-400)   */
  --ob-line:rgba(24,24,27,.09);         /* hairlines      */
  --ob-line-strong:rgba(24,24,27,.18);  /* input borders  */
  --ob-ring:0 0 0 1px rgba(24,24,27,.08),0 2px 4px rgba(24,24,27,.04);
  --ob-ring-lift:0 0 0 1px rgba(24,24,27,.10),0 4px 10px rgba(24,24,27,.07);
  --ob-overlay:rgba(24,24,27,.52);      /* modal scrim    */
  --ob-dots:rgba(24,24,27,.12);         /* dot texture    */
  --ob-hatch:rgba(24,24,27,.14);        /* hatch texture  */
  --ob-focus:rgba(139,92,246,.22);      /* focus ring     */
}
body.ob-on[data-ob-theme="dark"] {
  --ob-bg:#0a0a0a;  --ob-card:#171717;  --ob-inset:#101010;  --ob-inset2:#1c1c1c;
  --ob-side:#0d0d0d;
  --ob-text:#fafafa; --ob-text2:#e4e4e7; --ob-muted:#a1a1aa; --ob-muted2:#6b6b6b;
  --ob-line:rgba(255,255,255,.08);  --ob-line-strong:rgba(255,255,255,.18);
  --ob-ring:inset 0 1px 0 rgba(255,255,255,.05),
             0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.35);
  --ob-ring-lift:inset 0 1px 0 rgba(255,255,255,.07),
             0 0 0 1px rgba(255,255,255,.09), 0 6px 14px rgba(0,0,0,.45);
  --ob-overlay:rgba(0,0,0,.66);
  --ob-dots:rgba(255,255,255,.09);  --ob-hatch:rgba(255,255,255,.12);
}
```

**How a theme switch paints instantly:** components never hardcode colors —
they consume `var(--ob-…)`. Toggling the topbar button just changes
`data-ob-theme` on `<body>`; the browser re-resolves every custom property
and repaints. No reload, no JS color logic, no duplicated component CSS.

Two details worth noticing:

- **Dark cards get an extra `inset 0 1px 0` white highlight** in their ring —
  dark UI needs a top-edge light to read as "raised" where shadows alone
  would disappear into the background.
- **Initial theme resolution** happens in `ownerHome()`:
  `localStorage['ems.obTheme']` → else OS `prefers-color-scheme` → else light.

### 4.3 The color system

Colors follow a strict two-layer model: **neutral zinc for structure,
accent tones for meaning**.

**Layer 1 — neutrals (the whole chrome).** Canvas, cards, insets, sidebar,
text and hairlines are all steps of one zinc/neutral scale
(`#f4f4f5 → #ffffff` in light, `#0a0a0a → #171717` in dark). This is why the
console feels like a calm, professional instrument rather than a candy shop.

**Layer 2 — ten accent tones.** Each tone is a class that declares three
gradient variables plus a reference color:

```css
.ob-t-violet { --ob-c1:#a78bfa; --ob-c2:#8b5cf6; --ob-cb:#6d28d9; }  /* 400 / 500 / 700 */
.ob-t-cyan   { --ob-c1:#22d3ee; --ob-c2:#06b6d4; --ob-cb:#0e7490; }
.ob-t-sky    { … }  .ob-t-emerald{ … }  .ob-t-amber { … }  .ob-t-rose { … }
.ob-t-fuchsia{ … }  .ob-t-blue   { … }  .ob-t-lime  { … }  .ob-t-zinc { … }

body.ob-on                  .ob-t-violet { --ob-tone:#7c3aed; }  /* solid 600 */
body.ob-on[data-ob-theme="dark"] .ob-t-violet { --ob-tone:#a78bfa; }  /* 400 in dark */
```

| Variable | Role |
|---|---|
| `--ob-c1` | gradient **top** stop (the lighter 400-level shade) |
| `--ob-c2` | gradient **bottom** stop (the deeper 500/600 shade) |
| `--ob-cb` | chip/segment **border** (the darkest, 700-level) |
| `--ob-tone` | solid reference color — text, dots, badge tint (600 in light, 400 in dark so it stays readable on dark surfaces) |

**Tone semantics used across pages:**

| Tone | Meaning |
|---|---|
| `violet` | platform identity, primary actions, "me"/owner in chat |
| `sky` / `cyan` | informational counts (administrators, ConnectX) |
| `emerald` | active / healthy / success |
| `amber` | pending / attention |
| `rose` | rejected / danger |
| `zinc` | neutral / empty states |

**Where each variable is consumed:**

- `--ob-c1 → --ob-c2` gradient: icon chips, stackbar segments, active nav
  icon, meter fill, switch-on, chat bubbles (all use `linear-gradient(180deg,
  var(--ob-c1), var(--ob-c2))` — the vertical gradient *is* the 3D look).
- `--ob-cb`: their 1px borders (dark edge that grounds the gradient).
- `--ob-tone`: legend dots, badge text and — via `color-mix()` — badge
  backgrounds/borders:

```css
.ob-badge{
  background:color-mix(in srgb, var(--ob-tone) 14%, transparent);
  color:var(--ob-tone);
  border:1px solid color-mix(in srgb, var(--ob-tone) 32%, transparent);
}
```

`color-mix` is what lets one `--ob-tone` value produce a whole family of
tints (14% fill, 32% border) **without a pre-computed palette per tone** —
and it re-mixes automatically when the theme flips the tone variable.

### 4.4 The bento grid layout system

The console is built from five composable grids:

**1 · The shell** — the app frame is itself one CSS grid:

```css
.ob{ display:grid; grid-template-columns:264px minmax(0,1fr); min-height:100vh; }
```

`264px` fixed sidebar + fluid main area. `minmax(0,1fr)` (not plain `1fr`)
is deliberate: it lets long tables inside the main column shrink and scroll
instead of blowing out the grid — the classic CSS grid overflow fix.

**2 · KPI row** — four equal tiles above every data view:

```css
.ob-grid{ display:grid; gap:12px; }                    /* shared base */
.ob-kpis{ grid-template-columns:repeat(4,minmax(0,1fr)); }
```

**3 · The bento grid** — the signature 6-column lattice below the KPIs:

```css
.ob-bento{ grid-template-columns:repeat(6,minmax(0,1fr)); }
```

Cards claim width with span utility classes, so a page is composed like a
bento box — e.g. Overview = a 2/6 "License activity" card next to a 4/6
"Pending payments" card:

```css
.ob-c2{ grid-column:span 2 }   /* 1/3 of the bento  */
.ob-c3{ grid-column:span 3 }   /* 1/2               */
.ob-c4{ grid-column:span 4 }   /* 2/3               */
```

Six columns (not 12) keeps the arithmetic legible: 2+4, 3+3, 6 — a small
vocabulary of compositions, which keeps pages consistent.

**4 · Special-purpose grids:**

```css
.ob-grid2{ grid-template-columns:1fr 1fr; gap:12px }              /* form rows   */
.ob-addons{ grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); } /* catalogue */
.ob-couponadd{ grid-template-columns:1fr 64px auto; }             /* code+%+add  */
.ob-chat{ grid-template-columns:300px minmax(0,1fr); }            /* helpdesk    */
```

`auto-fill + minmax` makes the add-on catalogue responsive *without media
queries* — cards are never narrower than 215px and the browser packs as many
as fit.

**5 · The responsive ladder** — three breakpoints, mobile-first collapse:

| Breakpoint | What changes |
|---|---|
| `≤1120px` | KPIs 4→2 columns; bento 6→2; `ob-c2/c3`→span 1, `ob-c4`→span 2 |
| `≤960px` | Shell 264px+1fr → **single column**; sidebar becomes a sticky top bar (group labels hidden, nav becomes a horizontally scrollable icon row); helpdesk chat stacks with the list capped at 42vh |
| `≤640px` | KPIs and bento → 1 column; all spans → 1; form `grid2` → 1; coupon "add" button goes full-width below its inputs; topbar crumb label hidden |

The 960px transformation is the interesting one: the same `264px` sidebar
element restyles in place — `position:sticky; height:auto; border-bottom`
instead of `border-right` — so mobile keeps the full nav without a hamburger
menu or drawer (every element keeps its real purpose; nothing is hidden
behind an extra interaction).

### 4.5 Cards, panels & the ring-shadow depth model

The system uses **one depth recipe** everywhere — a hairline ring shadow,
never a floating drop shadow:

```css
.ob-card{ background:var(--ob-card); border-radius:20px; padding:15px;
          box-shadow:var(--ob-ring);
          display:flex; flex-direction:column; gap:8px; min-width:0; }
.ob-panel{ …same recipe, gap:12px; padding:16px }   /* tables & forms  */
.ob-addon{ …radius:18px }                            /* catalogue cards */
```

`--ob-ring` = `0 0 0 1px rgba(ink,.08), 0 2px 4px rgba(ink,.04)` — a 1px
"ring" drawn by spread shadow plus a whisper of lift. That subtle
construction is what makes cards read as *tiles sitting on the canvas* (the
bento aesthetic) instead of pop-up cards. Two refinements:

- **Radius rhythm: 20 → 14.** Outer cards are 20px; anything *inside* a card
  (visual areas `.ob-visual`, table wrappers `.ob-tw`) is 14px — inset by
  padding, so the radii nest concentrically.
- **`min-width:0` + flex column** on every card: children (especially
  tables and long code chips) truncate/scroll instead of stretching the grid.

### 4.6 The 3D gradient chip, layer by layer

The signature component — a 26×26 rounded-square icon tile that looks
*physically extruded*:

```css
.ob-chip{
  width:26px; height:26px; border-radius:8px;
  display:inline-grid; place-items:center; color:#fff;
  background:linear-gradient(180deg,var(--ob-c1),var(--ob-c2));  /* ① */
  border:1px solid var(--ob-cb);                                  /* ② */
  box-shadow:
    inset 0 .5px 0 rgba(255,255,255,.55),   /* ③ bright top bevel    */
    inset 0 2px 5px rgba(255,255,255,.28),  /* ④ inner glossy glow   */
    inset 0 -.5px 0 rgba(0,0,0,.28),        /* ⑤ dark bottom bevel   */
    0 1px 2px rgba(0,0,0,.10),              /* ⑥ contact shadow      */
    0 2px 4px rgba(0,0,0,.06);              /* ⑦ ambient shadow      */
}
```

How the illusion works:

1. **Vertical gradient** (light `c1` → deep `c2`) fakes a curved surface lit
   from above.
2. **Dark border** (`c1`'s 700-level) gives the tile a crisp, grounded edge.
3. **Half-pixel white inset at the top** — the classic "highlight edge" of
   real buttons/gels; sub-pixel sizing keeps it subtle, not glassy.
4. **Soft white inner glow** under the top edge adds gloss depth.
5. **Half-pixel black inset at the bottom** — the dark edge where light
   doesn't reach.
6–7. **Two tiny outer shadows** — one tight (contact with the surface), one
loose (ambient occlusion).

The exact same 5-shadow recipe (with slightly reduced whites) is reused by
stackbar segments, the active nav icon, primary/danger buttons, the meter
fill, the checked switch and the owner's chat bubble — one recipe, learned
once, recognized everywhere.

### 4.7 Textures: dotted grid & hatch

Two cheap, weightless textures give inset areas a "workbench" feel:

```css
.ob-dots{ background-image:radial-gradient(var(--ob-dots) .75px, transparent .75px);
          background-size:16px 16px; }
```

A 16×16px cell with a single 0.75px dot — used on KPI visual areas and
add-on art frames. Because the dot color is a token (`--ob-dots`), it
auto-inverts for dark mode.

```css
.ob-empty i{ border:1px dashed var(--ob-line-strong);
  background-image:repeating-linear-gradient(45deg,
    transparent 0 5px, var(--ob-hatch) 5px 6px); }
```

A 45° hatch stripe (6px period) inside a dashed rounded box — the universal
"nothing here yet" marker. Both textures are pure CSS gradients: no image
requests, no data-URI weight, infinite tiling.

### 4.8 Typography system

Two font stacks, three jobs:

| Stack | Used for |
|---|---|
| `--ob-font` (system UI sans) | everything you *read*: nav, headings, body, buttons, table cells |
| `--ob-mono` (system mono) | everything you *measure*: KPI values, table headers, badges, kickers, codes, timestamps, meters, log labels |

The mono face always ships with `font-variant-numeric:tabular-nums`
(fixed-width digits), so counters and money columns never jitter as values
change.

Signature text styles — the "tiny tracking label" is the most reused motif in
the whole system:

```css
.ob-kicker{ font-family:var(--ob-mono); font-size:8.5px; font-weight:700;
            letter-spacing:.18em; text-transform:uppercase; color:var(--ob-muted); }
```

Scale (a few anchors): base 13px/1.45 · page H1 17px · card H3 13px · KPI
value **23px mono** (the biggest number on any page — hierarchy by size and
face, not color) · body/table 12–12.5px · table header / badge / kicker
8.5px mono uppercase · code 10.5px.

### 4.9 Component reference

| Component | Class(es) | Notes |
|---|---|---|
| KPI tile | `.ob-card.ob-kpi` | chip + kicker, 23px mono value, mono footnote |
| Card / panel | `.ob-card` / `.ob-panel` | 20px radius, ring shadow; panel for tables/forms |
| Status badge | `.ob-badge.ob-t-*` | color-mix tint, mono uppercase |
| Buttons | `.ob-btn` + `-primary/-soft/-danger/-ghost/-sm` | primary/danger use the 3D recipe; soft = neutral fill; ghost = text |
| Tables | `.ob-tw > table` | mono uppercase sticky headers, hairline rows, hover tint, `.ob-num` mono numerals, `.ob-wrap` for wrapping cells |
| Forms | `.ob-form`, `.ob-grid2` | 12.5px inputs, 10px radius, violet focus ring (`--ob-focus`) |
| Switch | `.ob-switch` | 38×20 pill, violet gradient when checked, accessible focus ring (real checkbox, visually hidden) |
| Usage meter | `.ob-meter` | 6px violet gradient bar + "x / y used today" |
| Stacked bar | `.ob-stackbar` + `.ob-legend` | proportional tone segments (`flex:n`) |
| Chip | `.ob-chip` | the 3D icon tile (see 4.6) |
| Add-on card | `.ob-addons > .ob-addon` | 76px dotted art frame, clamped description |
| Coupons | `.ob-coupon(s)`, `.ob-couponadd` | mono code, off-state dimming, 3-column add row |
| HelpDesk | `.ob-chat`, `.ob-chat-item`, `.ob-msg`, `.ob-composer` | 300px+fluid two-pane, violet "me" bubbles, unread badges |
| Modal | `.ob-modal`, `.ob-modalbox`, `.ob-x` | blurred scrim, sticky header, 20px card |
| Loading | `.ob-load`, `.ob-pulse` | mono uppercase label + pulsing violet dot |
| Empty state | `.ob-empty` | dashed + hatched box, one calm sentence |
| Danger zone | `.ob-dangerzone` | rose-tinted double ring for destructive areas |
| Scrollbars / selection | `body.ob-on ::-webkit-scrollbar`, `::selection` | thin neutral thumbs, violet selection |

### 4.10 Motion

Deliberately minimal — two hover transitions (background/color at ~.14s) and
one animation:

```css
@keyframes obPulse{ 0%,100%{transform:scale(.65);opacity:.85} 55%{transform:scale(1.6);opacity:.08} }
```

used by the "live" dot (2.2s) and loading pulse (1.6s). Nothing else moves:
data UIs should feel like instruments, not carousels.

---

## 5. The CSS working process, end to end

What actually happens, in order, when an owner signs in:

1. **Scope opens.** `ownerHome()` adds `class="ob-on"` to `<body>`. Every
   rule in owner.css now matches; for every other surface the file remains
   dead weight. The old panel's CSS no longer exists anywhere.
2. **Theme resolves.** `data-ob-theme` is set on `<body>` (saved choice → OS
   preference → light). The browser computes the winning token block: the
   dark attributes' declarations override the light ones because
   `[data-ob-theme="dark"]` adds specificity over the bare `body.ob-on`
   selector.
3. **Frame paints.** `.ob` splits the viewport 264px/1fr. The sidebar
   (`.ob-side`, sticky, `--ob-side` background, hairline right border)
   renders brand mark, `OB_NAV` groups (mono group labels), nav buttons,
   sign-out. `minmax(0,1fr)` guarantees the main column can contain wide
   tables.
4. **Page renders.** `ownerPage(p)` writes the page into `#page`:
   `obHead()` → `.ob-grid.ob-kpis` (4 tiles) → `.ob-grid.ob-bento` (spans)
   → panels/tables. Tone classes on chips/badges/segments declare their
   local `--ob-c1/c2/cb/tone` variables; descendants consume them via
   `var()`. Specificity stays flat — `body.ob-on .ob-t-violet` for defaults,
   `body.ob-on[data-ob-theme="dark"] .ob-t-violet` for the dark flip.
5. **Defensive overrides apply.** Where `app.css` globals would otherwise
   win (bare `th/td/code/input/select/textarea/button` skins), owner rules
   answer with `body.ob-on .ob th { … !important }` — same importance,
   higher specificity, later in source order → owner wins.
6. **Interaction states** are pure CSS: nav `.on` (gradient icon), row
   hover (4% ink tint via color-mix), focus-visible rings (`--ob-focus`),
   switch checks, button hovers.
7. **Theme toggle** rewrites only `data-ob-theme` (and localStorage);
   custom properties cascade and the entire UI recolors in one repaint —
   surfaces, hairlines, shadows, textures, tones and badge tints together.
8. **Scope closes.** On sign-out the session is cleared and
   `location.reload()` rebuilds the page — `ob-on` is gone, owner.css goes
   inert, and the public/admin/shop styling is exactly as it always was.

---

## 6. Customization guide

All changes are one-file edits in `assets/css/owner.css` (markup helpers live
in `assets/js/app.js` next to `OB_NAV`).

- **Change the brand accent (primary buttons, focus, chat):** the accent is
  violet `#8b5cf6/#7c3aed/#6d28d9`. Search for `8b5cf6` (gradient stops),
  `7c3aed`/`6d28d9` (borders) and `--ob-focus`/`--ob-violet` and swap the
  hexes for your color trio (light-stop / deep-stop / border).
- **Make it denser / airier:** the rhythm lives in three values — `.ob-grid`
  `gap:12px`, `.ob-card` `padding:15px`, `.ob-panel` `padding:16px`. Change
  them once; every page follows.
- **Change card roundness:** `.ob-card/.ob-panel/.ob-modalbox` `border-radius:20px`
  and the nested `.ob-visual/.ob-tw` `14px` — keep the 6px nesting offset.
- **Add a tone:** add one line per theme block:
  `body.ob-on .ob-t-teal{--ob-tone:#0d9488}` and
  `.ob-t-teal{--ob-c1:#2dd4bf;--ob-c2:#14b8a6;--ob-cb:#0f766e}` — badges,
  chips and stackbar segments can use it immediately.
- **Add a page:** append a group/item to `OB_NAV`
  (`['my-page','My page','icon']`), add a branch in `ownerPage()`, and write
  a renderer using the helpers (`obHead/obKpi/obBadge/…`). Use existing
  classes only — `.ob-panel` for tables/forms, `.ob-grid.ob-kpis` for
  numbers — and the page will automatically be on-design, responsive and
  theme-aware.
- **Adjust responsive behavior:** the ladder is exactly three blocks at the
  bottom of the file (1120 / 960 / 640) — edit columns there, never inside
  component rules.

**Rules of the system worth keeping:** neutrals for structure, tones for
meaning · one depth recipe (ring shadows) · 20/14 radius nesting · mono for
anything numeric · every `!important` must be a defensive answer to an
`app.css` global · no new decorative components — every element keeps a real
purpose.

---

## 7. Verification

The redesign was verified four independent ways:

- **78/78 jsdom render checks** — all 16 pages, modals (plan editor with 4
  entitlement switches, blog editor, add-on setup, Zudo log, coupons), theme
  toggle, unread badge, plus admin/shop/public surfaces rendering their
  original markup with zero bento leakage.
- **16/16 write-flow checks** — every mutating action still hits the exact
  original endpoint with the exact original payload (license approve/reject,
  plan save with entitlement booleans, branding/pages/blogs, connectx/zudo/
  business-health, add-on setup & purchase approvals, coupon add/toggle/
  delete, factory reset with confirmation phrase, helpdesk send).
- **Real-Chromium style audit** — computed-style assertions in both themes:
  token values, 4-col KPI and 6-col bento grids, 20px cards with ring
  shadows, 3D chip gradients/shadows, tabular mono numerals, sticky table
  headers, no legacy skin bleed on `th/td/code/input/h1`, zero console
  errors, no horizontal overflow at 1440px or 390px.
- **Pixel-diff proof of isolation** — screenshots of the public landing,
  About page, Administrator Panel and Shop Panel taken from the code *before*
  and *after* the redesign are byte-identical.

# EMS Design System

**Applies to:** the EMS public website, Owner Console, Administrator Panel and Shop Panel
**Owner:** Dexter Studio · **Last reviewed:** November 2026
**Status:** living document — update it in the same commit as any UI change.

This file documents the design system **as implemented**. Every token, class and
rule below exists in the repository today; nothing here is aspirational. When the
implementation and this document disagree, the implementation is the bug —
fix one of them in the same commit.

---

## Table of contents

1. [Brand foundations](#1--brand-foundations)
2. [Agent Bento Grid philosophy](#2--agent-bento-grid-philosophy)
3. [Color system](#3--color-system)
4. [Typography](#4--typography)
5. [Layout and spacing](#5--layout-and-spacing)
6. [Component standards](#6--component-standards)
7. [Public website design system](#7--public-website-design-system)
8. [Workspace design system](#8--workspace-design-system)
9. [Animation and interaction](#9--animation-and-interaction)
10. [Responsive and accessibility standards](#10--responsive-and-accessibility-standards)
11. [CSS architecture and naming conventions](#11--css-architecture-and-naming-conventions)
12. [Rules for future AI agents](#12--rules-for-future-ai-agents)

---

## 1 · Brand foundations

### Identity

| Item | Value |
|---|---|
| Product name | **EMS** |
| Positioning | A complete **multi-store retail business management platform** |
| Provider line | **Powered by Dexter Studio** (always separate copy, never inside the symbol) |
| Primary tagline | Manage every store. Run your business with clarity. |
| Symbol | *Shared Core* — four modular corner forms linked into a rounded-diamond hub (`assets/brand/ems-mark.svg`) |

### Positioning statement

EMS helps a retail business owner run inventory, purchases, sales, customers,
dues, expenses, staff and business performance through **one connected platform**,
across **one or many stores**.

Write copy for the business owner deciding whether EMS fits their shop. Every
sentence must describe a real capability, a real constraint or a real next step.

### Visual philosophy

- **Editorial first, product second.** Type and whitespace carry the composition;
  the product screenshots carry the proof.
- **Restrained, not empty.** Neutral surfaces, one accent family, hairline borders.
  Colour is a signal (status, service, role) — never decoration.
- **Honest interfaces.** Product previews use real EMS layout patterns, real module
  names and clearly-labelled sample data. No invented customer counts, no fake
  testimonials, no unverifiable statistics.
- **Asymmetric calm.** Bento compositions mix 2/3/4-column spans; not every block
  is a card and not every section is a grid.

### Voice

Declarative, short, specific. Say what the system does, then what it means for the
owner. Avoid "revolutionise", "supercharge", "seamless", "game-changing", and any
sentence whose removal loses no information.

### Brand colour meanings

| Colour | Value | Meaning |
|---|---|---|
| Evergreen Teal | `#0F766E` | EMS primary — actions, links, active state |
| Core Teal | `#0D9488` | Hub accent — gradient chips, highlights, focus |
| Soft Mint | `#F4F8F7` | Page canvas for the app and marketing base |
| Deep Ink | `#132A27` | Wordmark, dark surfaces, footer/CTA panels |
| Emerald | `#10B981` | Positive/paid/active status |
| Amber | `#F59E0B` | Attention, due, read-only, pending |
| Rose | `#F43F5E` | Error, rejected, destructive |
| Sky | `#0EA5E9` | Informational, administrator accent |
| Violet | `#7C3AED` | Platform owner accent, AI services |

---

## 2 · Agent Bento Grid philosophy

Agent Bento Grid is the shared visual language of every EMS surface
(`agent-bento-grid.md` is the original reference). It is a *composition* language,
not a rule that everything must be a card.

### Composition principles

- **6-column bento.** Dashboards and marketing bentos use `repeat(6, minmax(0,1fr))`
  with spans of 2, 3 or 4 columns (`.ob-bento/.ob-c2/.ob-c3/.ob-c4`,
  `.adm-bento`, `.shp-bento`, `.pub-bento/.pub-c2/.pub-c3/.pub-c4`).
- **Deliberate asymmetry.** Pair one dominant tile with two supporting tiles rather
  than six equal boxes. The end of a row may be a text block, a hairline divider or
  a horizontal list.
- **One idea per tile.** Title, one short paragraph, one visual. Nothing else.
- **Rhythm over uniformity.** Section spacing uses `--pub-section` (public) and a
  12px gap scale (panels); bigger gaps separate ideas, not tiles.

### Card construction

| Property | Value |
|---|---|
| Radius | `20px` (`--pub-r-card`, `.ob-card`, `.adm-card`, `.shp-card`) |
| Inner visual radius | `14px` (`--pub-r-inner`, `.ob-visual`) |
| Padding | `18–22px` public bento tiles, `15–16px` panel cards |
| Surface | White card on neutral canvas (`#FFFFFF` on `#F6F8F7` / `#F4F4F5`) |
| Gap inside card | `8–12px` |
| Content order | chip + title (+ tiny mono label) → description → visual |

### Surface hierarchy

1. **Canvas** — page background (`--pub-canvas`, `--ob-bg`).
2. **Card** — the primary surface (`--pub-surface`, `--ob-card`).
3. **Inset** — wells inside a card for chips, tables, chart areas (`--pub-inset`).
Escalate with one layer only. A card inside a card inside a card is a bug.

### Borders and ring shadows

Borders are **rings, not strokes**:

```css
--pub-ring: 0 0 0 1px rgba(16,40,36,.07), 0 2px 4px rgba(16,40,36,.04);
--pub-ring-lift: 0 0 0 1px rgba(16,40,36,.09), 0 16px 32px -18px rgba(16,40,36,.22);
--ob-ring: 0 0 0 1px rgba(24,24,27,.08), 0 2px 4px rgba(24,24,27,.04);   /* panels */
```

Dark surfaces add an inner highlight instead of a light ring
(`inset 0 1px 0 rgba(255,255,255,.06)`). Never use a 1px `border` for a bento card:
the ring *is* the border.

### Dotted-grid and hatch textures

| Texture | Class | Use |
|---|---|---|
| 16px dot grid | `.pub-dots`, `.ob-dots`, `.adm-dots`, `.shp-dots` | Empty visual areas, hero backdrop masks, preview wells |
| 45° hatch | `.ob-hatch`, `.adm-hatch`, `.shp-hatch` | Panel empty fields and decorative fills |

On the public site the textures are painted by the section they belong to
(`.pub-hero::after` dot grid with a radial mask, `.pub-cta::after` 45° hatch,
`.pub-blog-cover--empty::after` dot grid, `.pub-empty-ic` hatch tile) so a
texture can never be applied to a surface that did not ask for it.

Textures stay at **≤16% opacity** of the theme ink and never sit behind body copy
longer than two lines.

### Gradient icon chips

Chips are 3D-tinted squares with a fixed vertical gradient, a darker border and a
top inner highlight:

```css
.pub-chip { width:34px; height:34px; border-radius:10px; color:#fff;
  background: linear-gradient(180deg, var(--pc1), var(--pc2));
  border:1px solid var(--pcb);
  box-shadow: inset 0 .5px 0 rgba(255,255,255,.5), inset 0 -1px 0 rgba(0,0,0,.14), 0 1px 2px rgba(16,40,36,.14); }
```

Tone classes set the three stops (`--pc1/--pc2/--pcb`) **and** the readable accent
(`--ptone`) used for text and dots:

| Public | Panels | Gradient | Accent |
|---|---|---|---|
| `.pub-t-teal` | — | `#5CC1B2 → #0D9488` | `#0F766E` |
| `.pub-t-emerald` | `.ob-t-emerald`, `.adm-t-emerald`, `.shp-t-emerald` | `#34D399 → #10B981` | `#059669` |
| `.pub-t-sky` | `.t-sky` | `#38BDF8 → #0EA5E9` | `#0284C7` |
| `.pub-t-amber` | `.t-amber` | `#FBBF24 → #F59E0B` | `#B45309` |
| `.pub-t-violet` | `.t-violet` | `#A78BFA → #8B5CF6` | `#6D28D9` |
| `.pub-t-rose` | `.t-rose` | `#FB7185 → #F43F5E` | `#BE123C` |
| `.pub-t-zinc` | `.t-zinc` | `#A1A1AA → #71717A` | `#52525B` |

One chip per card. Two chips in a card means the card is doing two jobs.

### Accent-colour usage

- Accent = **meaning**, never mood: emerald = healthy/paid, amber = attention,
  rose = destructive, sky = informational, violet = AI/owner.
- A tile may tint its *chip, status pill and one bar*, not its background.
- Never place two competing accent families in the same visual.

### Rules against decorative clutter

Not allowed: floating 3D blobs, random particle fields, oversized meaningless
gradients, drop shadows on text, illustrated mascots, badge stacks, animated
backgrounds behind body copy, emoji as icons.

Allowed: one masked dot grid, one soft radial tint, one hairline ring, one gradient
chip, one micro-interaction per tile.

---

## 3 · Color system

### Public website tokens (`assets/css/public.css`, scoped to `.pubsite`)

| Token | Light value | Role |
|---|---|---|
| `--pub-canvas` | `#F6F8F7` | Page background |
| `--pub-surface` | `#FFFFFF` | Cards, header, form surfaces |
| `--pub-inset` | `#FAFBFA` | Wells inside cards |
| `--pub-inset2` | `#F1F5F4` | Chips, quiet buttons, table heads |
| `--pub-deep` / `--pub-deep2` | `#0D221F` / `#123430` | CTA band, footer gradient |
| `--pub-text` | `#14201E` | Primary text |
| `--pub-text2` | `#3D4D49` | Secondary text, list content |
| `--pub-muted` | `#64746F` | Descriptions, helper text |
| `--pub-muted2` | `#8B9A95` | Mono labels, metadata, placeholders |
| `--pub-line` | `rgba(16,40,36,.09)` | Hairline dividers, table rules |
| `--pub-line-strong` | `rgba(16,40,36,.16)` | Input borders, FAQ rules |
| `--pub-dots` | `rgba(16,40,36,.14)` | Dot-grid texture |
| `--pub-primary` | `#0F766E` | Primary buttons, links, active states |
| `--pub-primary-dark` | `#0B5F59` | Hover/pressed primary |
| `--pub-accent` | `#0D9488` | Kicker dots, input focus border |
| `--pub-accent-soft` | `#5CC1B2` | Chart starts, audience bullets |
| `--pub-ink` | `#10201D` | Wordmark, nav text |
| `--pub-focus` | `0 0 0 3px rgba(13,148,136,.3)` | Focus glow on inputs |

There is **no dark public marketing theme**. The public site is a light surface by
design; the panels support light and dark (below). The CTA band and footer are the
only intentionally dark public surfaces.

### Semantic status colours (public)

| Meaning | Implementation |
|---|---|
| Verified / paid / active | `.pub-verify-state.is-ok` (emerald border + tint), `.pub-tag--accent` |
| Error / failed / rejected | `.pub-verify-state.is-error` (rose border + tint) |
| Attention | `.pub-t-amber` status pill |
| Informational | `.pub-t-sky` status pill |

### Workspace tokens

Owner, Administrator and Shop stylesheets define the same token set with their own
prefix and accent. Light values are identical across the three panels
(`#f4f4f5` canvas, `#ffffff` card, `#fafafa` inset/sidebar, `#18181b` text,
`#71717a` muted, `rgba(24,24,27,.09)` line); dark values are `#0a0a0a` canvas,
`#171717` card, `#101010` inset, `#fafafa` text. See §8 for the per-panel accent
and theme attribute.

### Contrast rules

- Body text: `--pub-text2` on `--pub-surface` (≈9:1).
- Muted text: `--pub-muted` — never below 12.5px, never the only carrier of meaning.
- Accent-on-tint text (status pills) uses `--ptone` at ≥11% tint background, which
  keeps ≥4.5:1 for the 8.5–9.5px mono labels at their heavier weight.
- Never place white text on `--pub-accent-soft`.

---

## 4 · Typography

### Families

```css
--pub-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--pub-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
```

Panels use the identical stacks under `--ob-font/--ob-mono`, `--adm-font/--adm-mono`,
`--shp-font/--shp-mono`. No web fonts are loaded anywhere in EMS — the sandboxed
preview and offline deployments must render identically.

### Hierarchy

| Role | Class | Size | Weight | Tracking | Line height |
|---|---|---|---|---|---|
| Hero display | `.pub-hero-title` | `clamp(34px, 4.7vw, 58px)` | 690 | `-0.038em` | 1.02 |
| Page H1 | `.pub-page-title` | `clamp(29px, 3.6vw, 44px)` | 680 | `-0.032em` | 1.06 |
| Section H2 | `.pub-h2` | `clamp(27px, 3.2vw, 40px)` | 680 | `-0.028em` | 1.08 |
| Card H3 | `.pub-feature-title h3` | `14.5px` | 660 | `-0.012em` | 1.3 |
| Lead paragraph | `.pub-lead` | `clamp(15.5px, 1.2vw, 17.5px)` | 400 | `0` | 1.62 |
| Body | `.pub-feature p`, `.pub-role > p` | `12.8–13.2px` | 400 | `0` | 1.6 |
| Prose (editorial) | `.pub-prose p` | `15px` | 400 | `0` | 1.78 |
| Legal prose | `.pub-legal-body p` | `14.6px` | 400 | `0` | 1.82 |

### Labels

`.pub-kicker` — mono, `10.5px`, weight 600, `0.16em` tracking, uppercase, with a
6px accent dot. Used once per section to name the section's job.
`.pub-feature-title span` / `.pub-plan-name span` — mono, `8.5–9px`, `0.1–0.12em`,
uppercase — the "which subsystem" line under a card title.

### Buttons

`.pub-btn` — 14px / 650 / `-0.005em`, min-height 46px (38px for `--sm`).
Panel buttons use the shell's own button classes (`ob-btn`, `adm-btn`, `shp-btn`).

### Monospaced text

Use `--pub-mono` for: numbers, invoice/reference codes, store codes, metrics,
uppercase eyebrow labels, dates in tables, keyboard-shortcut style metadata.
Never set a paragraph in mono.

### Numeric typography

Numbers are always tabular: `font-variant-numeric: tabular-nums` (`.pub-mono`,
`.pub-kpi b`, `.pub-plan-price`, `.pub-tbl .num`, `.ob-kpi-val`). Currency is
formatted with `toLocaleString('en-BD')` and two decimals in document views.

### Responsive sizing

All display sizes use `clamp()` — there are no separate mobile font overrides.
Body copy stays at its desktop size; only spacing and grid spans change.

---

## 5 · Layout and spacing

### Containers

| Container | Value | Where |
|---|---|---|
| Public shell | `max-width: 1180px` + `padding-inline: clamp(20px, 4vw, 40px)` | `.pub-shell` |
| Page head measure | `780px` | `.pub-page-head-inner` |
| Reading measure | `68ch` (prose), `74ch` (legal) | `.pub-prose`, `.pub-legal-body` |
| Article measure | `760px` | `.pub-article` |
| Panel content | `max-width: 1240px`, `padding: 22px 24px 34px` | `.ob-page`, `.adm-page`, `.shp-page` |

### Sidebar dimensions

| Panel | Sidebar | Collapse |
|---|---|---|
| Owner Console | `.ob-side` — sticky, `100vh`, 240px grid column | Burger below 1024px |
| Administrator | `.adm-side` — sticky, `100vh` | Burger below 1024px |
| Shop Panel | `.shp-side` — sticky, `100vh` | Burger below 1024px |

Panel layouts are `grid-template-columns: 240px minmax(0,1fr)` with the content
column owning its own scroll region.

### Grid behaviour

| Grid | Definition |
|---|---|
| Bento (public + panels) | `repeat(6, minmax(0,1fr))`, gap `14px` public / `12px` panels |
| KPI row | `repeat(4, minmax(0,1fr))` panels · `repeat(3, minmax(0,1fr))` hero preview |
| Roles | `repeat(3, minmax(0,1fr))` → 1 column ≤900px |
| Steps | `repeat(5, minmax(0,1fr))` → 3 ≤1080px → 1 ≤720px |
| Plans | `repeat(auto-fit, minmax(min(100%,268px),1fr))` |
| Blog | featured split + `repeat(auto-fill, minmax(min(100%,300px),1fr))` |

### Spacing scale

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26 · 34` px.
Section rhythm: `--pub-section: clamp(64px, 8vw, 108px)` between sections,
`clamp(26px, 3vw, 42px)` between a section head and its content.

### Breakpoints (public website)

| Width | Behaviour |
|---|---|
| ≤1080px | Hero collapses to one column; steps → 3 columns; about/legal sidebars unstick; services → 2-up |
| ≤900px | Desktop nav → drawer; roles → 1 column; split sections stack; FAQ → 1 column; bento → 4 columns |
| ≤720px | All bento spans → 1; hero CTAs full width; form grids → 1 column; footer → 1 column |
| ≤460px | Hero KPI row → 1; audience strip stacks |

Panels use their own breakpoints (1024px sidebar collapse, 900px KPI 2-up, 640px
single column) inside `owner.css` / `admin.css` / `shop.css`.

---

## 6 · Component standards

### Buttons

| Variant | Class | Use |
|---|---|---|
| Primary | `.pub-btn` | One per view/section: the main next step |
| Secondary | `.pub-btn--secondary` | Alternative of equal weight, on light surfaces |
| Ghost | `.pub-btn--ghost` | Low-emphasis actions in dense areas |
| Quiet | `.pub-btn--quiet` | Nav utilities ("Administrator login") |
| Small | `.pub-btn--sm` | 38px height for inline and card actions |

Rules: verb-first labels ("Create your business account", "Choose this plan"),
never "Submit"/"Click here"; one primary per section; disabled state uses
`opacity: .45` + `cursor: not-allowed`.

### Inputs, selects, textareas

`.pub-field` wraps a mono uppercase label, an optional required `em`, and the
control. Controls: 44px min height, `11px` radius, `--pub-inset` background,
`--pub-line-strong` border, focus = accent border + `--pub-focus` ring, no outline
removal. Panels use `.ob-input` / `.adm-input` / `.shp-input` with the same
behaviour. Labels are always visible; placeholders are examples, never labels.

### Cards

`.pub-card` (base) and `.pub-card--pad` (22px). A card that reacts to the pointer
is a `.pub-feature` (the marketing tile with the lift); a static container is a
`.pub-card`. Panel equivalents: `.ob-card`, `.adm-card`, `.shp-card`, with
`.ob-panel`/`.adm-panel`/`.shp-panel` for full-width regions.

### Navigation

Public: sticky `.pubnav` (68px, blurred white), centered link pill group, right
action cluster (Administrator login · Shop login · Create account · burger).
Active page = `aria-current="page"` + inset pill background.
Mobile: `.pub-drawer` — backdrop + sliding panel (≤380px) with links, sign-in group
and a primary CTA; opened by `.pub-burger` (`aria-expanded`, `aria-controls`),
closed by Escape, backdrop, any navigation, or the × button.

Panels: sticky sidebar with grouped nav (mono group labels) + sticky top bar
(page kicker + title, actions, user chip, burger).

### Tabs

`.tabs` (shared, app.css) — segmented row; active = filled accent, inactive = tint.
Admin/Owner/Shop use the same visual with their own accent.

### Badges / tags

`.pub-tag` (24px pill, mono 9.5px uppercase) and its variants `--accent` and
`--outline`. Status pills inside visuals: `.pub-status` (19px,
tone-tinted). Panels: `.ob-badge`, `.adm-badge`, `.shp-badge`.

### Modals

Panels: `.ob-modal`, `.adm-modal`, `.shp-modal` (overlay `rgba(...,.52)`, 20px card,
sticky header with × close, scrollable body, Escape + backdrop close).
Auth: `.authlayer` + `.authmodal` (450px) from `app.css`.
Rule: a modal never contains another modal; destructive confirmations use
`confirm()` only where the panel already does.

### Dropdowns

Panel dropdowns are absolutely positioned cards with the panel ring shadow and a
`z-index` below modals. Always close on outside click and Escape. Never rely on
`title` attributes for essential content.

### Tables

- Documents/verification: `.pub-verify-table` (mono uppercase head on
  `--pub-inset2`, hairline rows, right-aligned numerics).
- Compact in-card tables: `.pub-tbl`.
- Panel data tables: `.ob-table`, `.adm-table`, `.shp-table` inside `.tablewrap`
  (horizontal scroll owned by the wrapper, never the page).

### Empty states

`.pub-empty` = dashed hatch icon tile + one sentence + one action. Panels use
`.ob-empty` with the same anatomy. Empty states always say what will appear and
how to make it appear.

### Loading and skeleton states

`.pub-skel` / `.pub-skel-line` (shimmer 1.3s). Panels use the `sk-*` family in
`app.css` (`sk-kpis`, `sk-table`, `sk-cards`…) which mirror the real layout's
dimensions so nothing jumps on load. Skeletons are `aria-hidden`; the live region
is separate.

### Alerts and notices

`.pub-note` (info: icon + sentence, on `--pub-surface` with ring) and
`.pub-step-note`. Panels use inline banner rows. Alerts never sit inside a
`.pub-card` body — they replace the card.

### Toast notifications

`#toast.haloHost` + `.haloToast` (app.css) — top-right stack, 380px max, variant
`is-success` / `is-error` (`role="status"` / `role="alert"`), auto-dismiss 3.8s/
5s, slide-in from 22px. Copy states what happened; error copy never exposes stack
traces.

### Tooltips

Panel icon buttons carry `aria-label` + `title`. There is no custom tooltip layer;
do not add one for essential information.

### Pricing cards

`.pub-plan` — 22px padding, 20px radius, ring; featured variant adds a 1.5px accent
ring + "Most chosen" flag. Contents: name + plan label, mono price, description,
two-cell fact grid (stores / duration), entitlement list (included = check,
excluded = minus), one full-width CTA, one micro-caption about activation.
All values come from `GET /api/public/license-plans` at render time.

### Feature cards

`.pub-feature` — chip, mono subsystem label, title, one paragraph, one visual
(`.pub-visual`). Hover lifts 2px and swaps the ring for `--pub-ring-lift`.

---

## 7 · Public website design system

Rendered by `assets/js/public_site.js`, styled by `assets/css/public.css`
(everything scoped to `.pubsite`). Routes:

| Route | Renderer | Layout |
|---|---|---|
| `/` | `renderLanding()` | Hero + audience strip + bento operations + steps + roles + multi-store split + services + pricing + FAQ + CTA |
| `/?page=about` | `renderPage('about')` | Editorial: page head, CMS prose + sticky fact card, values strip, CTA |
| `/?page=terms` | `renderPage('terms')` | Long-form: page head, 74ch measure, document meta aside |
| `/?page=privacy` | `renderPage('privacy')` | Long-form (built-in page — no CMS slug needed) |
| `/?page=blog` | `renderPage('blog')` | Featured article split + card grid |
| `/?page=blog-post&id=…` | `renderPage('blog-post')` | 760px article column |
| `/?page=contact` | `renderPage('contact')` | Split: editorial copy + form card |
| `/?page=app-store` | `renderPage('app-store')` | Page head + `.pub-store-shell` wrapping `mountAppStore()` |
| `/?verify=<token>` etc. | `renderVerification()` | Verification card (see below) |

### Public navigation

Links: Features (`/#operations`), How it works (`/#how-it-works`), Pricing
(`/#pricing`), About, Blog, Contact. Actions: Administrator login, Shop login,
Create account. The EMS owner login is intentionally *not* in the desktop nav — it
appears in the mobile drawer and the footer's "Access & legal" column so customer
sign-up is never confused with platform access.

### Hero composition

Two columns (`1.04fr / 0.96fr`): story on the left (eyebrow → display headline with
one accented phrase → lead → primary + secondary CTA → three factual reassurance
notes); product preview on the right. Background = soft radial tint + masked dot
grid, no image files.

### Product previews

Built from real UI patterns (app bar, store switcher, KPI tiles, chart, activity
rows, permission matrix, table). Rules:

- Compose with `.pub-preview` + `.pub-preview-chrome` (window chrome with URL pill
  and a "Preview" tag) for the hero; `.pub-visual` for in-card previews.
- Label sample data — the hero caption reads "Illustrative interface preview ·
  sample data, not live figures", and sample chart/row groups carry a "Sample"
  micro-label.
- Never show a metric that could be mistaken for a customer statistic.

### Marketing Bento layouts

`.pub-bento` (6 columns) with `.pub-c2/.pub-c3/.pub-c4/.pub-c6` spans. Current
operations grid: 3+3 (inventory, sales) · 2+2+2 (purchases, dues, expenses) ·
4+2 (reports, permissions). Change spans deliberately; keep at least one 4-span row
per bento so the rhythm is not uniform.

### Feature sections

Head pattern: `.pub-kicker` + `.pub-h2` + `.pub-lead` inside `.pub-head`, optionally
paired with a `.pub-link` on the right (`.pub-head-row`). Body: bento, steps, roles,
split or services grid. One section = one claim.

### Pricing presentation

`.pub-pricing` band (inset gradient + hairline) with plan cards from the API, plus a
`.pub-pricing-foot` explaining payment verification and a register CTA. Plan CTA
opens the administrator sign-in/registration flow — EMS does not sell directly from
the marketing page, and the pricing UI must never imply otherwise.

### CTA sections

`.pub-cta` — dark teal panel, radial highlight, 45° hatch, heading + one sentence +
two actions + a mono meta rail. One per page, at the end.

### Footer

`.pub-foot` — 4 columns (brand + description + trust notes · Product · Company ·
Access & legal) on a deep gradient, bottom bar with copyright and the Dexter Studio
attribution. Legal links: Terms of Service, Privacy Policy.

### Editorial page layouts

- **About** — `.pub-about-grid` (prose 1.32fr + sticky aside 0.68fr), CMS body is
  the source of truth, `.pub-values` strip of three factual tiles.
- **Terms / Privacy** — `.pub-legal` (74ch body + document meta aside using the
  shared `.pub-aside-card`), comfortable `1.8+` line height, mono metadata.
- **Blog** — featured article (cover + body split), then `.pub-blog-grid`; the post
  page uses `.pub-article` at 760px with `.pub-prose` body.
- **Contact** — `.pub-contact` split; form uses `.pub-field`, client-side required
  checks, disabled submit while sending, toast on success/failure.
- **App Store** — page head + `.pub-store-shell`; the store component keeps its own
  search/filter/detail sheet (`as-*` classes, `app_store_view.css`).
- **Verification** — `.pub-verify-card`: state block (loading spinner / verified
  check / error cross), then shop head, party columns, items table, totals, and a
  footer naming TrueBill. Loading, success and failure are three separate states.

---

## 8 · Workspace design system

Three consoles, one visual language, three accents. Each stylesheet is the **only**
theme for its panel and is scoped to a body class so shells cannot leak into each
other or into the public site.

| Surface | Body class | Stylesheet | Accent | Accent token | Docs |
|---|---|---|---|---|---|
| Owner Console | `body.ob-on` (+ `data-ob-theme="dark"`) | `assets/css/owner.css` | Violet | `--ob-violet: #7c3aed` (`#a78bfa` dark) | `OWNER-CONSOLE.md` |
| Administrator Panel | `body.adm-on` (+ `data-adm-theme="dark"`) | `assets/css/admin.css` | Sky | `--adm-primary: #0ea5e9` | `admin.md` |
| Shop Panel | `body.shp-on` (+ `data-shp-theme="dark"`) | `assets/css/shop.css` | Emerald | `--shp-primary: #10b981` | `shop.md` |

Shared behaviour that must **not** be duplicated per panel:

- Auth modal, password recovery, toast stack, skeletons, notification bell and
  document/print styles live in `assets/css/app.css`.
- Business consoles (Clothing `cshop.css`, Pharmacy `pshop.css`, Supershop
  `sshop.css`) extend the Shop Panel and reuse its tokens.
- The App Store view (`app_store_view.css`, `as-*`) re-maps its `--as-*` tokens from
  `--theme-*` (public), `--ob-*`, `--adm-*` so one component serves all surfaces.

Do not restyle another panel to match yours. If a pattern should be shared, promote
it to `app.css` with a neutral class and document it here; if it is panel-specific,
keep it behind the panel's body class.

---

## 9 · Animation and interaction

| Interaction | Duration / easing |
|---|---|
| Hover colour, link colour | `0.14–0.16s ease` |
| Card lift (transform + ring) | `0.2s ease`, `translateY(-2px)` |
| Button lift | `0.16s ease`, `translateY(-1px)`, stronger shadow |
| Drawer slide | `0.3s cubic-bezier(.32,.72,0,1)`, backdrop fade `0.24s` |
| Modal enter | `0.28s ease` fade + 8px rise |
| Verification card enter | `0.42s cubic-bezier(.22,1,.36,1)` (`pubRise`) |
| Skeleton shimmer | `1.3s linear infinite` |
| Toast in/out | `0.34s` slide from 22px, out `0.32s` |
| Chart bar / meter fill | static height/width (no entrance animation) |

Rules:

- Hover states are **visual only** — never move content enough to shift a layout
  edge, never animate `width`/`height` of text containers.
- Focus is always visible: 2px `--pub-primary` outline + 2px offset on public
  surfaces, panel focus ring (`--ob-focus` etc.) on inputs.
- Dropdown/drawer/modal close on Escape and on outside click.
- `@media (prefers-reduced-motion: reduce)` collapses every public animation and
  transition to `0.001ms`, stops infinite shimmer/pulse loops and cancels hover
  transforms. Panels implement the same guard per stylesheet.
- Never autoplay video, never animate a background behind body copy.

---

## 10 · Responsive and accessibility standards

### Behaviour by device

| Surface | Desktop ≥1081px | Tablet 721–1080px | Mobile ≤720px |
|---|---|---|---|
| Public hero | Text + preview side by side | Stacked, preview capped at 660px | Stacked, floating card hidden, CTAs full width |
| Public nav | Full link pill row | Full row until 900px, then drawer | Drawer with sign-in group |
| Bento | 6 columns | 4 columns | 1 column |
| Steps | 5 across | 3 + 2 | Vertical list |
| Panels | Sidebar + content | Sidebar collapses to drawer ≤1024px | Single column, sticky top bar |

### Responsive bento rules

- Spans collapse to the full row on small screens; never let a tile be narrower than
  260px without stacking.
- Preview visuals shrink by cropping (`overflow: hidden`) rather than reflowing into
  unreadable furniture; decorative floaters are removed ≤720px.
- Tables scroll inside their wrapper (`.tablewrap`, `.pub-verify-table-wrap`).

### Keyboard and focus

- Every interactive element is a real `<button>`/`<a>`; marketing cards that
  navigate contain a real link.
- Tab order follows the visual order. The public shell starts with a skip link
  (`.pub-skip`) that becomes visible on focus.
- Drawer/modal: focus moves into the panel on open, Escape closes, backdrop is a
  labelled button.
- No hover-only affordances; FAQ uses native `<details>`.
- Icons are `aria-hidden="true"`; icon-only controls carry `aria-label`.

### Colour and contrast

Body copy ≥4.5:1, large type ≥3:1, hairline borders are decorative only (never the
sole boundary of a control — inputs also carry a background change on focus).
`@media (prefers-contrast: more)` strengthens lines and muted text on the public
site.

### Semantic markup

`header`/`nav`/`main`/`section`/`article`/`aside`/`footer`, one `h1` per page,
ordered headings, `<table>` with `thead`, labelled form controls, breadcrumb
`aria-label`, `aria-current="page"` on active nav.

### Touch targets

Minimum 38×38px for icon buttons, 44px for primary controls, 8px minimum spacing
between adjacent targets. Drawer links are 44px tall.

---

## 11 · CSS architecture and naming conventions

### Stylesheet responsibilities

| File | Owns | Scope |
|---|---|---|
| `assets/css/app.css` | Shared shell utilities, auth modal, toast, skeletons, notification panel, invoice print/document styles | Global, but only classes nothing else claims |
| `assets/css/public.css` | Entire public website (marketing + editorial + verification) | `.pubsite` |
| `assets/css/owner.css` | Owner Console | `body.ob-on` |
| `assets/css/admin.css` | Administrator Panel | `body.adm-on` |
| `assets/css/shop.css` | Shop Panel | `body.shp-on` |
| `assets/css/cshop.css` / `pshop.css` / `sshop.css` | Clothing / Pharmacy / Supershop consoles | Inside the Shop Panel shell |
| `assets/css/app_store_view.css` | App Store component used by public + owner + admin | `.ems-store` |

Load order in `index.html`: `app.css` → `public.css` → `owner.css` → `admin.css` →
`app_store_view.css` → `shop.css` → `cshop.css` → `pshop.css` → `sshop.css`.
Later panel sheets are scoped, so order is a safety net rather than a cascade
dependency.

### Prefixes

| Prefix | Owner |
|---|---|
| `pub-` | Public website (this design system's marketing components) |
| `ob-` | Owner Console |
| `adm-` | Administrator Panel |
| `shp-` | Shop Panel |
| `csh-` / `psh-` / `ssh-` | Clothing / Pharmacy / Supershop consoles |
| `as-` | App Store component |
| `sk-` | Skeletons (shared) |
| `ntf-` | Notification panel (shared) |
| `invoicePrint*`, `printItems`, `printTotals` | Printable documents |
| `halo*` | Toast stack |

### Adding a component without breaking a panel

1. Choose the surface. If it only exists on the public site, prefix `pub-` and put
   it in `public.css` inside `.pubsite`. If it is panel-specific, keep the panel
   prefix and the panel's body scope.
2. If two or more surfaces need it, promote it to `app.css` with a neutral,
   unprefixed name and **no** panel theme variables — read colours from
   `var(--theme-*)` or local tokens.
3. Use existing tokens (`--pub-*`, `--ob-*`, `--adm-*`, `--shp-*`); do not hardcode
   hex values that a token already provides.
4. Never target generic element selectors (`button`, `div`, `table`) at the top
   level — always scope (`.pubsite button`, `body.ob-on .ob button`).
5. Never override another surface's class from your stylesheet. If you must reset a
   legacy global (as `shop.css` does for `.brand`), comment why.
6. Keep one-off inline styles out of markup; if a value is used twice, it becomes a
   class.
7. Test in all four surfaces plus dark mode (where supported) before committing.

### JavaScript responsibilities

| File | Owns |
|---|---|
| `assets/js/app.js` | Session, routing, panels, API access, modals, toasts — the single implementation of every behaviour |
| `assets/js/public_site.js` | Public markup only; receives `api`, `esc`, `lucide`, `toast`, `showAuth`, `showEmsLogin`, `register`, `mountAppStore`, `getQrSvg` via `createPublicSite()` |
| `assets/js/app_store_view.js` | App Store component (public + owner + admin) |

The public renderer must never re-implement authentication, API calls or toasts; if
it needs new behaviour it gets another injected helper from `app.js`.

---

## 12 · Rules for future AI agents

1. **Read this file before implementing any UI.** Then read the panel's own doc
   (`OWNER-CONSOLE.md`, `admin.md`, `shop.md`) before editing that panel.
2. **Reuse tokens and components.** If a pattern already exists here, use it. If you
   need a new one, add it to the right stylesheet with the right prefix and document
   it in this file in the same change.
3. **Never rebuild the architecture.** The public site renders through
   `public_site.js`; the panels render through `app.js`. Do not introduce a
   framework, a build step, a CSS-in-JS layer, a CDN stylesheet or a web font.
4. **Scope every rule.** Public changes belong under `.pubsite`; panel changes
   belong under `body.ob-on` / `body.adm-on` / `body.shp-on`. A rule that can leak
   between surfaces is a defect.
5. **No invented content.** No fabricated statistics, customers, testimonials,
   prices, feature claims or legal promises. Pricing, plans, entitlements and
   branding come from the API (`public/license-plans`, `public/branding`,
   `public/page`, `public/blogs`, `app-store/apps`).
6. **Label sample data.** Any illustrative preview must say it is a preview.
7. **Preserve behaviour.** Existing routes, CMS content, verification workflows,
   download actions, auth modals and payment/license flows must keep working. The
   public renderer receives its capabilities from `app.js` — do not duplicate them.
8. **Keep the brand.** Evergreen Teal `#0F766E`, Core Teal `#0D9488`, Deep Ink
   `#132A27`, Soft Mint `#F4F8F7`, `ems-mark.svg`, "Powered by Dexter Studio".
9. **Accessibility is part of "done".** Keyboard path, visible focus, labels,
   contrast, reduced-motion and touch targets are acceptance criteria, not polish.
10. **Copy discipline.** A section must state a capability or help the visitor
    decide. Delete any sentence that could be removed without loss. No "revolutionary",
    "seamless", "unlock your potential".
11. **Verify before finishing.** Render every public route, check both themes in the
    panels you touched, and run `npm test`.
12. **Update the docs.** `README.md` (surface map), this file, and the relevant
    panel guide must stay accurate in the same commit.

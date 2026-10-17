# EMS brand guide

**Identity:** EMS — Shared Core  
**Provider line:** Powered by Dexter Studio  
**Status:** Approved for local project rollout; no trademark clearance search has been performed.

## Idea
Four modular corner forms link diagonally into a rounded-diamond core. The four modules stand for EMS's different shop workflows; the hub is the shared platform underneath them. Use the compact mark to identify EMS, not as a literal illustration of a shop or database.

## Logo files

| File | Use |
|---|---|
| `ems-mark.svg` | Primary symbol, full-colour vector master |
| `ems-mark-small.svg` | Optically heavier cut for 16–32 px uses |
| `ems-wordmark.svg` | Outlined EMS wordmark, standalone |
| `ems-logo-horizontal.svg` | Primary horizontal lockup for headers and documents |
| `ems-logo-stacked.svg` | Stacked lockup for square/vertical placements |
| `ems-landing-banner.svg` | Public website's dashboard hero illustration (not a logo master) |
| `variants/ems-mark-black.svg`, `-white.svg`, `-mono-0f766e.svg` | One-colour/reversed symbol variants |
| `variants/ems-mark-favicon.svg`, `-app-icon.svg` | Transparent favicon and teal-tile app icon |
| `variants/ems-logo-horizontal-*` / `ems-logo-stacked-*` | One-colour lockup variants |

The wordmark is converted to paths from **DejaVu Sans Bold**, with custom tracking and alignment. No external font is needed to display the delivered logo. The wordmark is intentionally simple so the Shared Core symbol remains the memorable identifier.

## Palette

| Role | HEX | RGB | Approx. CMYK* |
|---|---|---|---|
| Evergreen Teal — primary | `#0F766E` | 15, 118, 110 | 87, 0, 7, 54 |
| Core Teal — hub accent | `#0D9488` | 13, 148, 136 | 91, 0, 8, 42 |
| Deep Ink — wordmark/text | `#132A27` | 19, 42, 39 | 55, 0, 7, 84 |
| Soft Mint — background | `#F4F8F7` | 244, 248, 247 | 2, 0, 0, 3 |
| White — reverse | `#FFFFFF` | 255, 255, 255 | 0, 0, 0, 0 |

\*CMYK values are formula conversions, not a printer proof. No Pantone/spot match has been approved; ask the print vendor for a physical proof before production.

## Approved versions

- Full colour: primary modules, core accent, ink wordmark on white or Soft Mint.
- One colour: black or Evergreen Teal on light backgrounds.
- Reverse: white on Deep Ink or Evergreen Teal. Use the supplied reverse SVG; do not recolour the centre independently.
- App icon: white small-size mark on the Evergreen Teal tile. The system may crop tile corners, so retain the clear internal safe area.
- Provider line: **Powered by Dexter Studio**. Keep this as separate copy below/beside the brand, never inside the symbol. In the app, preserve owner-editable branding settings, with Dexter Studio as the default.

## Spacing and minimum size

- Let **1x** equal the diameter of the Shared Core hub in the master symbol. Keep at least 1x of clear space around the visible mark and lockup.
- Use the small-size cut below 32 px. The mark's recommended minimum is 16 px for the favicon cut and 22 px for the standard symbol.
- Use the horizontal lockup at 150 px wide or larger; use the stacked lockup at 120 px wide or larger. For print, keep the symbol at least 6 mm tall and the horizontal lockup at least 32 mm wide.
- Do not add strokes, shadows, outlines, extra nodes, or unapproved colours. Do not stretch, skew, rotate, separate the four modules, or place the mark on a busy photograph.

## Application assets

- Site metadata and PWA theme use `#0F766E`; the app manifest names EMS and includes Dexter Studio in its description.
- PWA icons live at `assets/favicon*`, `assets/apple-touch-icon.png`, `assets/android-chrome-*.png`, and `assets/maskable-512.png`.
- iOS launch screens are `assets/apple-splash-*.png`; they pair the stacked lockup with the line “Every shop, in sync.” and the Dexter Studio provider line.
- The landing hero loads `assets/brand/ems-landing-banner.svg`; keep the presentation dashboard illustrative, not live data.

## Handover notes

The original A/B/C concept sheet is retained in `brand-concepts/` as exploration history. Production assets in `assets/brand/` reflect the selected **B — Shared Core** direction. Branding defaults, API fallbacks and Postgres/D1 migrations now use EMS / Dexter Studio; apply `supabase/migrations/055_brand_identity_refresh.sql` or `supabase/d1/migration_ems_brand_refresh.sql` to update legacy stored defaults without replacing custom owner labels. The repository changes remain local and have not been pushed.

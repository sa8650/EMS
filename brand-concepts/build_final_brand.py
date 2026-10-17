#!/usr/bin/env python3
"""Build the selected EMS Shared Core identity masters (SVG) and landing banner."""
from pathlib import Path
import math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "brand"
OUT.mkdir(parents=True, exist_ok=True)

PRIMARY = "#0F766E"     # evergreen teal
ACCENT = "#0D9488"      # shared-core accent
INK = "#132A27"         # dark ink
FONT_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

MAIN_PATHS = [
    "M60 40H100A16 16 0 0 1 116 56V72H72V100A16 16 0 0 1 56 116H40V60A20 20 0 0 1 60 40Z",
    "M196 40H156A16 16 0 0 0 140 56V72H184V100A16 16 0 0 0 200 116H216V60A20 20 0 0 0 196 40Z",
    "M60 216H100A16 16 0 0 0 116 200V184H72V156A16 16 0 0 0 56 140H40V196A20 20 0 0 0 60 216Z",
    "M196 216H156A16 16 0 0 1 140 200V184H184V156A16 16 0 0 1 200 140H216V196A20 20 0 0 1 196 216Z",
]
SMALL_PATHS = [
    "M52 28H100A16 16 0 0 1 116 44V68H68V100A16 16 0 0 1 52 116H28V52A24 24 0 0 1 52 28Z",
    "M204 28H156A16 16 0 0 0 140 44V68H188V100A16 16 0 0 0 204 116H228V52A24 24 0 0 0 204 28Z",
    "M52 228H100A16 16 0 0 0 116 212V188H68V156A16 16 0 0 0 52 140H28V204A24 24 0 0 0 52 228Z",
    "M204 228H156A16 16 0 0 1 140 212V188H188V156A16 16 0 0 1 204 140H228V204A24 24 0 0 1 204 228Z",
]
MAIN_LINKS = [
    "M65 75L75 65L117 107L107 117Z",
    "M191 75L181 65L139 107L149 117Z",
    "M65 181L75 191L117 149L107 139Z",
    "M191 181L181 191L139 149L149 139Z",
]
SMALL_LINKS = [
    "M52 78L78 52L122 104L104 122Z",
    "M204 78L178 52L134 104L152 122Z",
    "M52 178L78 204L122 152L104 134Z",
    "M204 178L178 204L134 152L152 134Z",
]


def svg_header(width: int | str, height: int | str, view_box: str, title: str, desc: str = "") -> str:
    d = f'<desc>{desc}</desc>' if desc else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="{view_box}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{title}</title>{d}')


def mark_group(paths, primary=PRIMARY, accent=ACCENT, core_size=32, links=()):
    segs = [f'<path d="{p}"/>' for p in (*paths, *links)]
    inset = (256 - core_size) / 2
    radius = core_size * 0.18
    return (f'<g fill="{primary}" fill-rule="nonzero">' + "".join(segs) + "</g>"
            f'<rect x="{inset:g}" y="{inset:g}" width="{core_size}" height="{core_size}" '
            f'rx="{radius:g}" transform="rotate(45 128 128)" fill="{accent}"/>')


def svg_number(value: float) -> str:
    """Round font path coordinates safely via SVGPathPen's numeric formatter."""
    rounded = round(float(value), 2)
    return f"{rounded:.2f}".rstrip("0").rstrip(".") or "0"


def outlined_wordmark(cap_height: float, color: str, tracking_em: float = 0.075):
    font = TTFont(str(FONT_PATH))
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    glyph_names = [cmap[ord(ch)] for ch in "EMS"]
    bounds = []
    for name in glyph_names:
        pen = BoundsPen(glyph_set)
        glyph_set[name].draw(pen)
        bounds.append(pen.bounds)
    cap_font_units = max(b[3] for b in bounds if b)
    scale = cap_height / cap_font_units
    tracking = upm * tracking_em
    advances = [font["hmtx"][name][0] for name in glyph_names]
    total_width = sum(advances) * scale + tracking * scale * (len(glyph_names) - 1)
    cursor = 0.0
    paths = []
    for name, advance in zip(glyph_names, advances):
        pen = SVGPathPen(glyph_set, ntos=svg_number)
        transformed = TransformPen(pen, (scale, 0, 0, -scale, cursor, cap_height))
        glyph_set[name].draw(transformed)
        data = pen.getCommands()
        paths.append(f'<path d="{data}" fill="{color}"/>')
        cursor += advance * scale + tracking * scale
    return total_width, "".join(paths)


# Canonical symbol and high-contrast small-size cut.
(OUT / "ems-mark.svg").write_text(
    svg_header(256, 256, "0 0 256 256", "EMS Shared Core mark",
               "Four rounded modular corners converge around one shared core.")
    + mark_group(MAIN_PATHS, core_size=32, links=MAIN_LINKS) + "</svg>\n", encoding="utf-8")
(OUT / "ems-mark-small.svg").write_text(
    svg_header(256, 256, "0 0 256 256", "EMS Shared Core small-size mark",
               "A bolder optical cut of the Shared Core symbol for favicon and app-icon use.")
    + mark_group(SMALL_PATHS, core_size=38, links=SMALL_LINKS) + "</svg>\n", encoding="utf-8")

# Outlined wordmark: DejaVu Sans Bold glyphs, optically tracked and vertically aligned.
word_w, word_paths = outlined_wordmark(96, INK)
word_w_int = math.ceil(word_w)
(OUT / "ems-wordmark.svg").write_text(
    svg_header(word_w_int, 100, f"0 0 {word_w_int} 100", "EMS outlined wordmark",
               "EMS in outlined DejaVu Sans Bold capitals with custom tracking.")
    + word_paths + "</svg>\n", encoding="utf-8")

# Horizontal lockup: symbol visual mass and outlined name are optically balanced.
lockup_x = 169
lockup_width = round(lockup_x + word_w + 20)
(OUT / "ems-logo-horizontal.svg").write_text(
    svg_header(lockup_width, 192, f"0 0 {lockup_width} 192", "EMS horizontal logo",
               "The Shared Core mark paired with the outlined EMS wordmark.")
    + f'<g id="symbol" transform="translate(4.68 7.68) scale(0.69)">{mark_group(MAIN_PATHS, core_size=32, links=MAIN_LINKS)}</g>'
    + f'<g id="wordmark" transform="translate({lockup_x} 46)">{word_paths}</g>'
    + "</svg>\n", encoding="utf-8")

# Stacked lockup for square and vertical applications.
stack_word_w, stack_paths = outlined_wordmark(60, INK)
stack_x = round((256 - stack_word_w) / 2)
(OUT / "ems-logo-stacked.svg").write_text(
    svg_header(256, 280, "0 0 256 280", "EMS stacked logo",
               "The Shared Core mark above the outlined EMS wordmark.")
    + f'<g id="symbol" transform="translate(39.68 0) scale(0.69)">{mark_group(MAIN_PATHS, core_size=32, links=MAIN_LINKS)}</g>'
    + f'<g id="wordmark" transform="translate({stack_x} 192)">{stack_paths}</g>'
    + "</svg>\n", encoding="utf-8")

# Website landing hero illustration: a bento-style operations dashboard, not part of the logo master.
tile_mark = mark_group(SMALL_PATHS, primary="#FFFFFF", accent="#A7F3D0", core_size=38, links=SMALL_LINKS)
banner = f'''<svg xmlns="http://www.w3.org/2000/svg" width="860" height="620" viewBox="0 0 860 620" role="img" aria-labelledby="title desc">
<title id="title">EMS retail operations dashboard</title>
<desc id="desc">A bento dashboard preview showing sales, inventory, a weekly chart, and four connected shop consoles.</desc>
<circle cx="686" cy="121" r="148" fill="#DDF4EF"/>
<circle cx="160" cy="499" r="82" fill="#EAF6F3"/>
<rect x="120" y="100" width="660" height="444" rx="28" fill="#D9E9E5"/>
<rect x="100" y="76" width="660" height="444" rx="28" fill="#FFFFFF" stroke="#D9E6E2" stroke-width="2"/>
<rect x="128" y="104" width="38" height="38" rx="12" fill="{PRIMARY}"/>
<g transform="translate(132 108) scale(.1171875)">{tile_mark}</g>
<text x="180" y="123" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" letter-spacing="-0.5">EMS</text>
<text x="180" y="140" fill="#70827E" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700" letter-spacing="1.3">RETAIL CONTROL</text>
<circle cx="660" cy="122" r="5" fill="#13A981"/>
<text x="674" y="126" fill="#55706A" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" letter-spacing="0.3">ALL SHOPS ONLINE</text>
<path d="M128 162H732" stroke="#E9EFED" stroke-width="2"/>
<text x="132" y="194" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="750" letter-spacing="-0.4">Today at a glance</text>
<text x="132" y="214" fill="#7A8A86" font-family="Arial, Helvetica, sans-serif" font-size="11">Your shop operations, brought together.</text>
<!-- KPI Bento cards -->
<rect x="128" y="236" width="190" height="102" rx="17" fill="#F1F8F6" stroke="#E1EEEA"/>
<text x="148" y="260" fill="#71837F" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="650">Sales today</text>
<text x="148" y="293" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="-0.8">BDT 24,860</text>
<rect x="148" y="309" width="52" height="16" rx="8" fill="#D9F3E9"/>
<text x="158" y="321" fill="#14785F" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="750">+12.8%</text>
<text x="205" y="321" fill="#82928E" font-family="Arial, Helvetica, sans-serif" font-size="9">vs yesterday</text>
<rect x="330" y="236" width="190" height="102" rx="17" fill="#FFFFFF" stroke="#E1EEEA"/>
<text x="350" y="260" fill="#71837F" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="650">Items in stock</text>
<text x="350" y="293" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="-0.8">1,284</text>
<text x="350" y="319" fill="#82928E" font-family="Arial, Helvetica, sans-serif" font-size="10">Across four shop types</text>
<rect x="532" y="236" width="200" height="102" rx="17" fill="#F7F9F7" stroke="#E1EEEA"/>
<text x="552" y="260" fill="#71837F" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="650">Low stock</text>
<text x="552" y="293" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="-0.8">18 items</text>
<rect x="552" y="307" width="9" height="9" rx="4.5" fill="#E6A746"/>
<text x="568" y="316" fill="#82928E" font-family="Arial, Helvetica, sans-serif" font-size="10">Review reorder list</text>
<!-- Weekly chart -->
<rect x="128" y="356" width="376" height="132" rx="17" fill="#FFFFFF" stroke="#E1EEEA"/>
<text x="148" y="381" fill="{INK}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="750">Sales performance</text>
<text x="148" y="398" fill="#879590" font-family="Arial, Helvetica, sans-serif" font-size="9">This week</text>
<path d="M148 455H482" stroke="#EDF2F0"/>
<path d="M148 431H482" stroke="#F0F4F2"/>
<path d="M148 407H482" stroke="#F0F4F2"/>
<rect x="175" y="437" width="20" height="18" rx="5" fill="#A9DCD3"/>
<rect x="218" y="423" width="20" height="32" rx="5" fill="#8BCFC3"/>
<rect x="261" y="430" width="20" height="25" rx="5" fill="#9ED8CE"/>
<rect x="304" y="405" width="20" height="50" rx="5" fill="{ACCENT}"/>
<rect x="347" y="416" width="20" height="39" rx="5" fill="#72C4B7"/>
<rect x="390" y="396" width="20" height="59" rx="5" fill="{PRIMARY}"/>
<rect x="433" y="410" width="20" height="45" rx="5" fill="#63B9AB"/>
<text x="173" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">M</text>
<text x="216" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">T</text>
<text x="259" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">W</text>
<text x="302" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">T</text>
<text x="345" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">F</text>
<text x="388" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">S</text>
<text x="431" y="475" fill="#94A19D" font-family="Arial, Helvetica, sans-serif" font-size="8">S</text>
<!-- Connected console card -->
<rect x="516" y="356" width="216" height="132" rx="17" fill="{INK}"/>
<text x="536" y="381" fill="#B7D3CC" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="750" letter-spacing="1">SHARED CORE</text>
<text x="536" y="404" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="750">Every shop, in sync.</text>
<circle cx="544" cy="433" r="5" fill="#2DD4BF"/>
<text x="558" y="437" fill="#D6E5E1" font-family="Arial, Helvetica, sans-serif" font-size="10">Electronics</text>
<circle cx="650" cy="433" r="5" fill="#5ED1C0"/>
<text x="664" y="437" fill="#D6E5E1" font-family="Arial, Helvetica, sans-serif" font-size="10">Clothing</text>
<circle cx="544" cy="462" r="5" fill="#74D9C8"/>
<text x="558" y="466" fill="#D6E5E1" font-family="Arial, Helvetica, sans-serif" font-size="10">Pharmacy</text>
<circle cx="650" cy="462" r="5" fill="#9CE7D7"/>
<text x="664" y="466" fill="#D6E5E1" font-family="Arial, Helvetica, sans-serif" font-size="10">Supershop</text>
</svg>'''
(OUT / "ems-landing-banner.svg").write_text(banner, encoding="utf-8")
print(f"wrote brand masters to {OUT}; outlined wordmark width {word_w_int}px")

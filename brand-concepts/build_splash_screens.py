#!/usr/bin/env python3
"""Regenerate EMS iOS splash images from the approved Shared Core identity."""
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BRAND = ASSETS / "brand"
LOGO = BRAND / "ems-logo-stacked.svg"
BG = "#F4F8F7"
INK = "#132A27"
MUTED = "#61736E"
PRIMARY = "#0F766E"

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def hex_rgba(value, alpha=255):
    value = value.lstrip("#")
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)


logo_png = cairosvg.svg2png(url=str(LOGO), output_width=560, output_height=612)
logo_path = Path("/tmp/ems-stacked-logo.png")
logo_path.write_bytes(logo_png)
logo = Image.open(logo_path).convert("RGBA")

files = sorted(ASSETS.glob("apple-splash-*.png"))
for target in files:
    m = re.search(r"(\d+)x(\d+)", target.name)
    if not m:
        continue
    width, height = map(int, m.groups())
    canvas = Image.new("RGBA", (width, height), hex_rgba(BG))
    draw = ImageDraw.Draw(canvas, "RGBA")

    # Low-contrast corner forms echo the four modules without competing with the logo.
    r1 = int(width * 0.22)
    draw.ellipse((-r1 * 0.75, int(height * 0.13), r1 * 1.25, int(height * 0.13) + r1 * 2),
                 fill=hex_rgba("#E4F2EF", 190))
    r2 = int(width * 0.25)
    draw.ellipse((int(width - r2 * 1.25), int(height * 0.72), int(width + r2 * 0.75),
                  int(height * 0.72) + r2 * 2), fill=hex_rgba("#EAF5F2", 200))

    logo_width = min(620, int(width * 0.50))
    logo_height = round(logo.height * logo_width / logo.width)
    logo_resized = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
    tagline_size = max(22, min(36, round(width * 0.031)))
    provider_size = max(14, min(22, round(width * 0.019)))
    tagline_font = ImageFont.truetype(FONT_BOLD, tagline_size)
    provider_font = ImageFont.truetype(FONT_REGULAR, provider_size)
    tagline = "Every shop, in sync."
    provider = "POWERED BY DEXTER STUDIO"
    accent_width = max(28, round(width * 0.035))
    accent_height = max(4, round(width * 0.004))
    gap_a = max(24, round(width * 0.028))
    gap_b = max(18, round(width * 0.018))
    tagline_box = draw.textbbox((0, 0), tagline, font=tagline_font)
    tagline_height = tagline_box[3] - tagline_box[1]
    provider_box = draw.textbbox((0, 0), provider, font=provider_font)
    provider_height = provider_box[3] - provider_box[1]
    total_height = logo_height + gap_a + tagline_height + gap_b + accent_height + gap_b + provider_height
    top = int((height - total_height) / 2) - round(height * 0.015)
    x_logo = (width - logo_width) // 2
    canvas.alpha_composite(logo_resized, (x_logo, top))
    y = top + logo_height + gap_a
    draw.text(((width - (tagline_box[2] - tagline_box[0])) / 2, y - tagline_box[1]),
              tagline, font=tagline_font, fill=hex_rgba(INK))
    y += tagline_height + gap_b
    draw.rounded_rectangle(((width - accent_width) / 2, y,
                            (width + accent_width) / 2, y + accent_height),
                           radius=accent_height // 2, fill=hex_rgba(PRIMARY))
    y += accent_height + gap_b
    draw.text(((width - (provider_box[2] - provider_box[0])) / 2, y - provider_box[1]),
              provider, font=provider_font, fill=hex_rgba(MUTED))

    canvas.convert("RGB").save(target, format="PNG", optimize=True, compress_level=9)
    print(f"wrote {target.relative_to(ROOT)} ({width}×{height})")

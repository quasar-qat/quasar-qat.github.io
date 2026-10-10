"""Site icons from the top-bar logo in index.html (rose rounded square, four white bars).

    $QUASAR_ANIM_DIR/.venv/bin/python tools/video/make_icons.py

  assets/img/favicon.svg          = the inline logo SVG, verbatim (+ xmlns, minus aria-hidden)
  assets/img/favicon-32.png       = that SVG rasterised at 32x32 (transparent rounded corners)
  assets/img/apple-touch-icon.png = 180x180, full-bleed square (iOS applies its own corner mask)
PNGs are rasterised from the SVG's own rect geometry at 16x and downsampled (Lanczos).
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

SITE = Path(__file__).resolve().parents[2]
IMG = SITE / "assets/img"
html = (SITE / "index.html").read_text()
logo = re.search(r'<a class="wordmark".*?(<svg viewBox="0 0 32 32".*?</svg>)', html, re.S).group(1)
svg = logo.replace('<svg viewBox="0 0 32 32" aria-hidden="true">',
                   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">')
(IMG / "favicon.svg").write_text(svg + "\n")

RECTS = []
for m in re.finditer(r"<rect ([^>]*)/>", svg):
    a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    RECTS.append(dict(x=float(a.get("x", 0)), y=float(a.get("y", 0)), w=float(a["width"]),
                      h=float(a["height"]), rx=float(a.get("rx", 0)), fill=a["fill"]))
assert len(RECTS) == 5 and RECTS[0]["w"] == 32


def render(size, full_bleed=False, ss=16):
    s = size * ss / 32.0
    im = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, r in enumerate(RECTS):
        box = [r["x"] * s, r["y"] * s, (r["x"] + r["w"]) * s - 1, (r["y"] + r["h"]) * s - 1]
        rad = 0 if (full_bleed and i == 0) else r["rx"] * s
        d.rounded_rectangle(box, radius=rad, fill=r["fill"])
    return im.resize((size, size), Image.LANCZOS)


render(32).save(IMG / "favicon-32.png", optimize=True)
render(180, full_bleed=True).convert("RGB").save(IMG / "apple-touch-icon.png", optimize=True)
for f in ("favicon.svg", "favicon-32.png", "apple-touch-icon.png"):
    p = IMG / f
    print(f, p.stat().st_size, "bytes", Image.open(p).size if p.suffix == ".png" else "")

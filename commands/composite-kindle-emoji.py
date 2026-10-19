#!/usr/bin/env python3
"""Generate Kindle-specific emoji PNGs: transparent, but white-safe when flattened.

Background: two approaches have been tried.
Baking an opaque callout-colored background hid the box on a light-mode e-ink
Paperwhite, but on Kindle iOS — whose page is pure white and which doesn't paint
the callout tint behind the image — that baked tint shows as a colored rectangle
around every callout emoji. Plain transparent RGBA, on the other hand, can flatten
to Twemoji's *dark slate* transparent-pixel RGB on renderers that drop alpha,
producing a dark box.

This version takes the middle path that's correct on modern renderers and no worse
than white anywhere else: keep the original alpha (true transparency, clean edges),
but rewrite the RGB of fully-transparent pixels to white. So:

  - Renderer honors alpha (Kindle iOS, modern KFX) → genuinely transparent, no box,
    clean in light / sepia / dark mode. (This is the case we're fixing.)
  - Renderer flattens alpha (older e-ink) → transparent areas show WHITE, not dark
    slate: invisible on a white page, at worst a white box in dark/sepia mode.

No per-callout background is baked anymore — that was the source of the iOS colored
box. All emoji are treated identically.

Input:  SRC_DIR/*.png           (palette/RGBA, transparent, dark-slate under alpha)
Output: DST_DIR/*.png     (RGBA, transparent, white under alpha)
"""

import os
import sys

# Don't leave a __pycache__ in commands/ (it would ship in the npm package).
sys.dont_write_bytecode = True

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)

from _emoji_io import save_if_changed

if len(sys.argv) != 3:
    print("Usage: composite-kindle-emoji.py SRC_DIR DST_DIR", file=sys.stderr)
    sys.exit(2)
SRC_DIR, DST_DIR = sys.argv[1], sys.argv[2]


def whiten_transparent(src_path, dst_path):
    """Keep alpha; set the RGB of fully-transparent pixels to white.

    convert("RGBA") normalizes palette + tRNS sources (which some Kindle
    renderers mishandle). Image.composite(orig, white, mask) keeps the original
    channel where the pixel is visible (mask=255) and substitutes white where it
    is fully transparent (mask=0), leaving the alpha channel untouched so true
    transparency — and clean anti-aliased edges — survive.
    """
    src = Image.open(src_path).convert("RGBA")
    r, g, b, a = src.split()
    white = Image.new("L", src.size, 255)
    # mask: 255 for any visible pixel (alpha > 0), 0 for fully transparent.
    mask = a.point(lambda v: 255 if v > 0 else 0)
    r = Image.composite(r, white, mask)
    g = Image.composite(g, white, mask)
    b = Image.composite(b, white, mask)
    return save_if_changed(Image.merge("RGBA", (r, g, b, a)), dst_path)


def main():
    os.makedirs(DST_DIR, exist_ok=True)

    count = written = 0
    for filename in sorted(os.listdir(SRC_DIR)):
        if not filename.endswith(".png"):
            continue
        written += whiten_transparent(
            os.path.join(SRC_DIR, filename),
            os.path.join(DST_DIR, filename),
        )
        count += 1

    print(f"Kindle emoji PNGs (transparent, white under alpha) in {DST_DIR}: {count}, {written} rewritten")


if __name__ == "__main__":
    main()

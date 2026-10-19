#!/usr/bin/env python3
"""Generate print-specific emoji PNGs: fully opaque, flattened onto the exact
background each emoji sits on in the PDF.

Why this exists: the print PDF is
converted to PDF/X-1a:2001 for IngramSpark by commands/convert-pdfx.sh, which runs
Ghostscript with -dNOTRANSPARENCY. That flag is required — it keeps the
interior as vector text (without it, Ghostscript rasterizes every page to a
300 DPI bitmap: ~58 MB, no embedded fonts, no extractable text). But
-dNOTRANSPARENCY drops each image's soft-mask (SMask) instead of compositing it,
so a transparent Twemoji PNG loses its alpha and reveals the dark slate RGB
Twemoji stores in "transparent" pixels — the 💡/👔/💻/🤔 callout labels then
print as dark boxes.

Fix: hand Ghostscript images that have no alpha at all. Flatten each Twemoji onto
the solid colour it actually sits on, so there is no SMask to drop and no box to
reveal — matching pixels above and below:

  - Callout-label emoji (💡 👔 💻 🤔) always sit on the print callout fill
    (#e8e8e8, set in css/theme/11-print.css). Flatten onto #e8e8e8.
  - Body-text emoji sit on the white page. Flatten onto white.

Both output sets are fully opaque RGB (mode "RGB", no alpha channel), so
Ghostscript leaves them untouched and the CMYK conversion treats them as ordinary
opaque artwork. The callout fill (#e8e8e8) is the same source RGB as the baked
emoji background, so both convert to the same CMYK and stay seamless.

Only the PDF pipeline uses these (justfile `pdf` recipe). EPUB/Kindle/web keep the
transparent originals in img/emoji/ (they render alpha correctly).

Input:  SRC_DIR/*.png                (RGBA, transparent, dark-slate under alpha)
Output: CALLOUT_DST_DIR/*.png        (RGB, opaque, flattened onto #e8e8e8)
        BODY_DST_DIR/*.png           (RGB, opaque, flattened onto white)
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

if len(sys.argv) != 4:
    print("Usage: composite-print-emoji.py SRC_DIR CALLOUT_DST_DIR BODY_DST_DIR", file=sys.stderr)
    sys.exit(2)
SRC_DIR = sys.argv[1]

# (output dir, background RGB) — must match the backdrop each emoji sits on.
# Callout fill #e8e8e8 is defined in the kit theme (css/theme/11-print.css, @media print,
# all callout classes). Body emoji sit on the white page.
TARGETS = [
    (sys.argv[2], (0xE8, 0xE8, 0xE8)),
    (sys.argv[3], (0xFF, 0xFF, 0xFF)),
]


def flatten_onto(src_path, dst_path, bg_rgb):
    """Composite a transparent RGBA emoji onto a solid background and drop alpha.

    The result is mode "RGB" (no alpha channel at all), so Ghostscript's
    -dNOTRANSPARENCY has no soft-mask to discard: the image is already opaque and
    prints exactly as composited, anti-aliased edges blended into bg_rgb.
    """
    src = Image.open(src_path).convert("RGBA")
    bg = Image.new("RGBA", src.size, bg_rgb + (255,))
    bg.alpha_composite(src)
    return save_if_changed(bg.convert("RGB"), dst_path)


def main():
    total = 0
    for dst_dir, bg_rgb in TARGETS:
        os.makedirs(dst_dir, exist_ok=True)
        count = written = 0
        for filename in sorted(os.listdir(SRC_DIR)):
            if not filename.endswith(".png"):
                continue
            written += flatten_onto(
                os.path.join(SRC_DIR, filename),
                os.path.join(dst_dir, filename),
                bg_rgb,
            )
            count += 1
        print(f"Opaque emoji PNGs (bg #{bg_rgb[0]:02x}{bg_rgb[1]:02x}{bg_rgb[2]:02x}) in {dst_dir}/: {count}, {written} rewritten")
        total += count

    print(f"Total: {total} print emoji PNGs.")


if __name__ == "__main__":
    main()

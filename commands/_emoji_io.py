"""Shared PNG output for the emoji composite scripts."""

import os

from PIL import Image, ImageChops


def save_if_changed(img, dst_path):
    """Write img to dst_path unless the file there already has the same pixels.

    Books often commit the composited PNGs and recompress them losslessly
    (`just optimize-images`). Re-saving identical pixels with Pillow's encoder
    would undo that recompression on every build and leave the working tree
    dirty, so only real pixel changes are written. Returns True if it wrote.

    getbbox(alpha_only=False): by default an RGBA bbox looks at alpha alone,
    which would miss a color-only change.
    """
    if os.path.exists(dst_path):
        try:
            with Image.open(dst_path) as existing:
                same = (
                    existing.mode == img.mode
                    and existing.size == img.size
                    and ImageChops.difference(existing.convert(img.mode), img).getbbox(alpha_only=False) is None
                )
        except OSError:
            same = False  # unreadable or corrupt: overwrite it
        if same:
            return False
    img.save(dst_path, "PNG", optimize=True)
    return True

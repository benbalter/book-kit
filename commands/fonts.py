#!/usr/bin/env python3
"""Build the theme's fonts from the upstream releases, and print where they are.

    book-kit fonts               build (or reuse) the fonts; print their directory
    book-kit fonts --link PATH   also point the book's fonts directory at them

The kit doesn't ship the Latin subsets and Kindle static instances its theme
loads. Adobe's Source fonts are OFL-licensed with the Reserved Font Name
"Source", which bars redistributing modified versions under that name; a
subset made for your own build, embedded in your book, is fine. So this
downloads the unmodified upstream files pinned in toolchain.json `fonts`
(checked against their SHA-256), applies fonts/recipe.json, and caches the result.

The cache lives in $BOOK_KIT_CACHE, else $XDG_CACHE_HOME/book-kit, else
~/.cache/book-kit, keyed by the recipe, the pinned releases, and the fontTools
and brotli versions, so a build is a no-op once the fonts exist. The same
inputs give byte-identical files: nothing is timestamped with the build time.
"""

import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import urllib.request
import zipfile

# Don't leave a __pycache__ in commands/ (it would ship in the npm package).
sys.dont_write_bytecode = True


def require_font_tools():
    """Import fontTools and brotli, which only building the fonts needs.

    Imported here rather than at the top so a book that brings its own fonts
    directory doesn't need either package installed.
    """
    global brotli, fontTools, subset, TTFont, instancer
    try:
        import brotli
        import fontTools
        from fontTools import subset
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError as e:
        print(
            f"book-kit fonts: {e.name} is required. Install the kit's Python packages: "
            "python3 -m pip install -r node_modules/book-kit/requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)


KIT = os.environ.get("BOOK_KIT_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def log(msg):
    print(f"book-kit fonts: {msg}", file=sys.stderr)


def cache_root():
    if os.environ.get("BOOK_KIT_CACHE"):
        return os.environ["BOOK_KIT_CACHE"]
    base = os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(base, "book-kit")


def fetch(source, downloads):
    """A pinned file's bytes, downloaded once and checked against its SHA-256."""
    path = os.path.join(downloads, source["sha256"])
    if not os.path.exists(path):
        log(f"downloading {source['url']}")
        with urllib.request.urlopen(source["url"], timeout=120) as r:
            data = r.read()
        digest = hashlib.sha256(data).hexdigest()
        if digest != source["sha256"]:
            sys.exit(f"book-kit fonts: {source['url']} has SHA-256 {digest}, expected {source['sha256']}")
        os.makedirs(downloads, exist_ok=True)
        tmp = f"{path}.{os.getpid()}"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    with open(path, "rb") as f:
        return f.read()


def load(data):
    # recalcTimestamp=False keeps upstream's head.modified, so output doesn't
    # depend on when it was built.
    return TTFont(io.BytesIO(data), recalcTimestamp=False)


def save(font, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    font.flavor = "woff2"
    font.save(path)


def set_name(font, name_id, value):
    """Overwrite every record of name_id (adding a Windows English one if none)."""
    table = font["name"]
    records = [r for r in table.names if r.nameID == name_id]
    for r in records:
        r.string = value
    if not records:
        table.setName(value, name_id, 3, 1, 0x409)


def build(recipe, sources, downloads, out):
    zips = {}
    built = {}
    for job in recipe["subsets"]:
        src = job["source"]
        if "member" in job:
            if src not in zips:
                zips[src] = zipfile.ZipFile(io.BytesIO(fetch(sources[src], downloads)))
            font = load(zips[src].read(job["member"]))
        else:
            font = load(fetch(sources[src], downloads))
        options = subset.Options()
        options.layout_features = recipe["features"][job["features"]]
        options.drop_tables += job.get("drop_tables", [])
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=subset.parse_unicodes(recipe["unicodes"][job["unicodes"]]))
        subsetter.subset(font)
        for name_id, value in job.get("names", {}).items():
            set_name(font, int(name_id), value)
        path = os.path.join(out, job["out"])
        save(font, path)
        with open(path, "rb") as f:
            built[job["out"]] = f.read()

    for job in recipe["instances"]:
        font = load(built[job["from"]])
        axes = {a.axisTag: a.defaultValue for a in font["fvar"].axes}
        axes.update(job["axes"])
        static = instancer.instantiateVariableFont(font, axes)
        save(static, os.path.join(out, job["out"]))


def kit_link(path, root):
    """Is path a symlink book-kit made: into the font cache, or to this kit's
    fonts/ (where the kit bundled its fonts before building them)?"""
    if not os.path.islink(path):
        return False
    target = os.path.realpath(os.path.join(os.path.dirname(path), os.readlink(path)))
    cache = os.path.realpath(os.path.join(root, "fonts"))
    return target.startswith(cache + os.sep) or target == os.path.realpath(os.path.join(KIT, "fonts"))


def link(path, out, root):
    """Point the book's fonts directory at out, unless the book brought its own:
    a real directory, or a symlink book-kit didn't make, is left alone."""
    if os.path.islink(path) and os.readlink(path) == out:
        return
    os.symlink(out, f"{path}.{os.getpid()}")
    os.replace(f"{path}.{os.getpid()}", path)
    log(f"linked {path} -> {out} (add {path} to .gitignore)")


def main():
    args = sys.argv[1:]
    link_path = None
    if args[:1] == ["--link"] and len(args) == 2:
        link_path = args[1]
    elif args:
        sys.exit("usage: book-kit fonts [--link PATH]")
    root = cache_root()
    if link_path and (os.path.lexists(link_path) and not kit_link(link_path, root)):
        return  # The book's own fonts: don't build or touch anything.
    require_font_tools()

    with open(os.path.join(KIT, "fonts", "recipe.json"), "rb") as f:
        recipe_bytes = f.read()
    with open(os.path.join(KIT, "toolchain.json")) as f:
        sources = json.load(f)["fonts"]
    recipe = json.loads(recipe_bytes)

    key = hashlib.sha256(
        recipe_bytes
        + json.dumps(sources, sort_keys=True).encode()
        + f"fonttools {fontTools.version} brotli {brotli.__version__}".encode()
    ).hexdigest()[:16]
    out = os.path.join(root, "fonts", key)

    if not os.path.exists(os.path.join(out, ".complete")):
        os.makedirs(os.path.join(root, "fonts"), exist_ok=True)
        # Build beside the final directory and rename it into place, so an
        # interrupted or concurrent build never leaves a half-written set.
        tmp = tempfile.mkdtemp(prefix=f"{key}.", dir=os.path.join(root, "fonts"))
        try:
            build(recipe, sources, os.path.join(root, "downloads"), tmp)
            open(os.path.join(tmp, ".complete"), "w").close()
            try:
                os.rename(tmp, out)
            except OSError:
                if not os.path.exists(os.path.join(out, ".complete")):
                    raise
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        log(f"built {len(recipe['subsets']) + len(recipe['instances'])} fonts in {out}")

    if link_path:
        link(link_path, out, root)
    else:
        print(out)


if __name__ == "__main__":
    main()

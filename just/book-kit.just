# book-kit recipes. A book's justfile imports this file:
#
#   set allow-duplicate-recipes
#   import 'node_modules/book-kit/just/book-kit.just'
#
# Recipes run from the book's directory. Any recipe the book's justfile defines
# with the same name replaces the one here (that's what allow-duplicate-recipes
# is for), so a book can override a single step without forking the kit.
#
# Settings come from book.config.yml (defaults: the kit's defaults/book.config.yml).

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

kit      := source_directory() / ".."
bk       := "node " + kit / "bin/book-kit.js"
kit_defs := kit / "defaults"
dist     := shell(bk + ' config paths.dist')
name     := shell(bk + ' config output.basename')
work     := dist / ".book-kit"
pdfx_file := dist / (name + shell(bk + ' config output.pdfx_suffix') + ".pdf")
# Extra pandoc options for the epub, kindle, and html builds, e.g.
#   BOOK_KIT_PANDOC_ARGS='--toc-depth=3' just epub
# An environment variable rather than recipe arguments, so `just epub kindle
# html` runs three recipes instead of passing "kindle html" to pandoc.
pandoc_args := env('BOOK_KIT_PANDOC_ARGS', '')
# Build time: the book's last commit, so every build of a commit is
# byte-identical. pandoc stamps EPUB dcterms:modified, DOCX properties, and zip
# entries with it; postprocess-epub's repack and the dc:date of a book with no
# metadata.pub_date use it too. A SOURCE_DATE_EPOCH already in the environment
# wins. Outside a git checkout it's empty, and everything uses the current time.
export SOURCE_DATE_EPOCH := env('SOURCE_DATE_EPOCH', `git log -1 --format=%ct 2>/dev/null || true`)

# ─── Build ──────────────────────────────────────────────────────────────────

# Full build: every format, then the format checks.
[group('build')]
all: css epub kindle html pdf pdfx check

# Compile the Tailwind stylesheet (book's paths.css, which imports the kit theme).
# Skips when nothing Tailwind scans is newer than the output: a chapter-only edit
# still rebuilds, because Tailwind v4 generates utilities from the content.
[group('build')]
css: _setup
    @if [ -f {{dist}}/style.css ] && [ -z "$(find "$({{bk}} config paths.css)" "$({{bk}} config paths.src)" "$({{bk}} config paths.index)" {{kit}}/css {{kit}}/templates {{kit}}/filters -newer {{dist}}/style.css 2>/dev/null | head -1)" ]; then \
        echo "{{dist}}/style.css is up to date"; \
    else \
        npx @tailwindcss/cli -i "$({{bk}} config paths.css)" -o {{dist}}/style.css --minify; \
    fi

# EPUB 3 for Apple Books, Kobo, Google Play, D2D, IngramSpark (and KDP).
[group('build')]
epub: css _strip-css (_prepare "epub")
    {{bk}} minify-css {{dist}}/style-epub.css
    pandoc --defaults {{kit_defs}}/pandoc-epub.yml --defaults {{kit_defs}}/pandoc-epub-fonts.yml \
        --defaults "$({{bk}} config paths.index)" --defaults {{work}}/pandoc-epub.yml \
        {{pandoc_args}} --output {{dist}}/{{name}}.epub
    {{bk}} postprocess-epub {{dist}}/{{name}}.epub

# Kindle-optimized EPUB: static fonts, Twemoji images for e-ink, links as
# footnotes whose URLs stay tappable.
[group('build')]
kindle: css _strip-css (_prepare "kindle") _emoji
    {{bk}} kindle-fonts
    {{bk}} minify-css {{dist}}/style-epub.css {{dist}}/style-kindle.css
    {{bk}} prep-print-src --preserve-internal-links --link-footnote-urls >/dev/null
    pandoc --defaults {{kit_defs}}/pandoc-epub.yml --defaults {{kit_defs}}/pandoc-kindle.yml \
        --defaults {{work}}/print-index.yml --defaults {{work}}/pandoc-kindle.yml \
        --metadata kindle=true {{pandoc_args}} --output {{dist}}/{{name}}-kindle.epub
    {{bk}} postprocess-epub {{dist}}/{{name}}-kindle.epub

# Web edition (also what the link checker and accessibility tests run against).
[group('build')]
html: css (_prepare "html")
    pandoc --defaults {{kit_defs}}/pandoc-base.yml --defaults "$({{bk}} config paths.index)" \
        --defaults {{work}}/pandoc-html.yml {{pandoc_args}} --output {{dist}}/{{name}}.html

# DOCX for editorial workflows (track changes with an editor).
[group('build')]
docx: (_prepare "docx")
    pandoc --defaults {{kit_defs}}/pandoc-docx.yml --defaults "$({{bk}} config paths.index)" \
        --defaults {{work}}/pandoc-docx.yml --output {{dist}}/{{name}}.docx

# Generate a reference.docx (heading and body styles for the DOCX build).
[group('build')]
reference-docx:
    {{bk}} generate-reference-docx

# Print-ready PDF (6x9 trade paperback by default; links become footnotes).
[group('build')]
pdf: css (_prepare "pdf") _emoji
    {{bk}} prep-print-src --inject >/dev/null
    pandoc --defaults {{kit_defs}}/pandoc-base.yml --defaults {{work}}/print-index.yml \
        --defaults {{work}}/pandoc-pdf.yml --metadata pdf=true \
        --to=html5 --standalone --output {{dist}}/{{name}}.print.html
    {{bk}} reorder-print-frontmatter {{dist}}/{{name}}.print.html
    {{bk}} strip-property-rules {{dist}}/{{name}}.print.html
    weasyprint --base-url {{dist}}/ --pdf-version 1.4 --dpi 300 --optimize-images \
        {{dist}}/{{name}}.print.html {{dist}}/{{name}}.pdf
    @rm -f {{dist}}/{{name}}.print.html

# PDF/X-1a:2001 (CMYK, no transparency) for IngramSpark and other print services.
[group('build')]
pdfx: pdf
    {{bk}} convert-pdfx {{dist}}/{{name}}.pdf {{pdfx_file}} "$({{bk}} config print.pdfx_title)"

# Advance reader copies: <name>-arc.epub and <name>-kindle-arc.epub, the retail
# EPUBs plus a "not for redistribution" notice on the copyright page
# (filters/arc-notice.lua). Not part of `all`.
[group('build')]
arc: arc-epub arc-kindle

# ARC EPUB. Builds the retail EPUB first for its prepared CSS and pandoc
# defaults, then reruns pandoc with arc=true into its own file.
[group('build')]
arc-epub: epub
    pandoc --defaults {{kit_defs}}/pandoc-epub.yml --defaults {{kit_defs}}/pandoc-epub-fonts.yml \
        --defaults "$({{bk}} config paths.index)" --defaults {{work}}/pandoc-epub.yml \
        --metadata arc=true {{pandoc_args}} --output {{dist}}/{{name}}-arc.epub
    {{bk}} postprocess-epub {{dist}}/{{name}}-arc.epub

# ARC Kindle EPUB (see arc-epub).
[group('build')]
arc-kindle: kindle
    pandoc --defaults {{kit_defs}}/pandoc-epub.yml --defaults {{kit_defs}}/pandoc-kindle.yml \
        --defaults {{work}}/print-index.yml --defaults {{work}}/pandoc-kindle.yml \
        --metadata kindle=true --metadata arc=true {{pandoc_args}} --output {{dist}}/{{name}}-kindle-arc.epub
    {{bk}} postprocess-epub {{dist}}/{{name}}-kindle-arc.epub

# Release files: copies of the built formats named for the version in
# <dist>/release/ (book-v1.2.0.epub, book-kindle-v1.2.0.epub, ...) with a
# checksums.txt. Pass the release tag to fail on a mismatch with VERSION.
[group('build')]
release-files tag="":
    {{bk}} release-files {{ if tag != "" { "--tag " + tag } else { "" } }}

# ─── Validate ───────────────────────────────────────────────────────────────

# Everything a pull request should pass: chapter validators, Markdown lint, prose lint.
[group('validate')]
check-all: validate lint prose

# Chapter structure and house-style validators (book.config.yml `validators`).
[group('validate')]
validate:
    {{bk}} validate

# Markdown lint: the kit's config with lint.markdownlint merged in (or the
# book's own .markdownlint-cli2.jsonc).
[group('validate')]
lint *args:
    @{{bk}} markdownlint {{args}}

# Prose lint with textlint: the kit's base rules, lint.textlint, and the kit
# and preset rules lint.rules turns on (or the book's own .textlintrc). On
# GitHub Actions, findings are reported as annotations on each file and line.
[group('validate')]
prose *args:
    @{{bk}} prose {{args}}


# Format checks on built output: page-count lock and EPUB size budgets.
[group('validate')]
check:
    @if [ -f {{dist}}/{{name}}.pdf ]; then {{bk}} check-pdf-page-count {{dist}}/{{name}}.pdf; fi
    @if [ -f {{pdfx_file}} ]; then {{bk}} check-pdf-page-count {{pdfx_file}}; fi
    {{bk}} check-epub-size --ci

# EPUBCheck on the built EPUBs (needs Java and an epubcheck on PATH or $EPUBCHECK_JAR).
[group('validate')]
epubcheck:
    @for f in {{dist}}/{{name}}.epub {{dist}}/{{name}}-kindle.epub {{dist}}/{{name}}-arc.epub {{dist}}/{{name}}-kindle-arc.epub; do \
        [ -f "$f" ] || continue; \
        if [ -n "${EPUBCHECK_JAR:-}" ]; then java -jar "$EPUBCHECK_JAR" "$f"; else epubcheck "$f"; fi; \
    done

# ─── Maintenance ────────────────────────────────────────────────────────────

# Regenerate each section's key takeaways chapter from its chapters' TL;DRs.
[group('maintenance')]
key-takeaways:
    {{bk}} update-key-takeaways

# Print the build stamp ("<version> (<sha>)").
[group('maintenance')]
revision:
    @{{bk}} revision

# Losslessly recompress PNGs under paths.img.
[group('maintenance')]
optimize-images:
    {{bk}} optimize-images

# Remove build output.
[group('maintenance')]
clean:
    rm -rf {{dist}}

# ─── Internals ──────────────────────────────────────────────────────────────

# Create dist/ and, unless the book brings its own fonts directory, build the
# theme's fonts (`book-kit fonts`, cached after the first run) and link them
# there: the theme's @font-face rules load ../fonts/ relative to dist/. A link
# book-kit made (into an older cache entry, or to the kit's fonts/ from before
# the kit stopped bundling them) is re-pointed; anything else is the book's own.
[private]
_setup:
    @mkdir -p {{work}}
    @{{bk}} fonts --link "$({{bk}} config paths.fonts)"

# Write the resolved config (for Lua filters) and per-format pandoc defaults.
[private]
_prepare format: _setup
    @{{bk}} prepare {{format}} >/dev/null

# EPUB stylesheet: strip print-only and e-reader-unsupported CSS. Minifying is
# left to each recipe: kindle-fonts must read the unminified output.
[private]
_strip-css:
    {{bk}} strip-page-rules {{dist}}/style.css {{dist}}/style-epub.css

# Twemoji PNG variants for Kindle (white under alpha) and print (flattened opaque).
[private]
_emoji:
    @src="$({{bk}} config emoji.source_dir)"; src="${src:-{{kit}}/emoji}"; \
        kdir="$({{bk}} config emoji.kindle_dir)"; \
        cdir="{{dist}}/$({{bk}} config emoji.pdf_callout_dir)"; \
        bdir="{{dist}}/$({{bk}} config emoji.pdf_body_dir)"; \
        python3 {{kit}}/commands/composite-kindle-emoji.py "$src" "$kdir" >/dev/null; \
        python3 {{kit}}/commands/composite-print-emoji.py "$src" "$cdir" "$bdir" >/dev/null

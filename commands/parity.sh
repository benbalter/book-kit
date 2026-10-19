#!/usr/bin/env bash
# Compare two builds of a book format by format and fail on any real
# difference. Use it to prove a change that shouldn't touch the output (a kit
# upgrade, a toolchain bump, moving a book onto the kit) really doesn't.
#
#   book-kit parity BEFORE_DIST AFTER_DIST [WORK_DIR]
#
# WORK_DIR keeps the unpacked files for inspection; it must be new or empty,
# so a typo can't wipe a real directory. Without it, a temp dir is used and
# removed afterwards.
#
# Compares every output both directories have, named from book.config.yml:
# <basename>.epub, -kindle.epub, -arc.epub, -kindle-arc.epub, .html, .docx,
# .pdf, and <basename><output.pdfx_suffix>.pdf. A file in one directory but
# not the other fails. Differences that carry no content are ignored:
#   - EPUB/DOCX build timestamps (dcterms:modified, dcterms:created)
#   - PNG bytes when the decoded pixels match (re-encoded, not a new image)
#   - Ghostscript's random six-letter font-subset prefixes
# PDFs are checked for page count (and print.page_count, if locked), extracted
# text, embedded fonts, and every page's rendering; the PDF/X also for its
# PDF/X-1a:2001 marker and output intent.
#
# Needs unzip, poppler (pdfinfo, pdftotext, pdffonts, pdftoppm), and a python3
# with Pillow and pikepdf. Run from the book (book-kit runs commands there).

set -uo pipefail
export LC_ALL=C

usage="usage: book-kit parity BEFORE_DIST AFTER_DIST [WORK_DIR]"
BEFORE=${1:?$usage}
AFTER=${2:?$usage}
if [ -n "${3:-}" ]; then
  WORK=$3
  if [ -e "$WORK" ] && [ -n "$(ls -A "$WORK" 2>/dev/null)" ]; then
    echo "book-kit parity: $WORK isn't empty; pass a new or empty WORK_DIR" >&2
    exit 2
  fi
  mkdir -p "$WORK"
else
  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT
fi
BK=(node "$(dirname "$0")/../bin/book-kit.js")
NAME=$("${BK[@]}" config output.basename)
PDFX_SUFFIX=$("${BK[@]}" config output.pdfx_suffix)
fail=0

bad() { echo "  ✗ $*"; fail=1; }
ok() { echo "  ✓ $*"; }

same_pixels() {
  python3 - "$1" "$2" <<'PY'
import sys
from PIL import Image, ImageChops
a, b = (Image.open(p) for p in sys.argv[1:3])
same = a.size == b.size and ImageChops.difference(a.convert("RGBA"), b.convert("RGBA")).getbbox(alpha_only=False) is None
sys.exit(0 if same else 1)
PY
}

strip_timestamps() {
  sed -E \
    -e 's|<meta property="dcterms:modified">[^<]*</meta>|<meta property="dcterms:modified"/>|' \
    -e 's#<dcterms:(created|modified)([^>]*)>[^<]*</dcterms:[a-z]+>#<dcterms:\1\2/>#g' "$1"
}

# Unzip both sides and compare member by member.
compare_zip() {
  local file=$1 dir="$WORK/$1"
  mkdir -p "$dir/before" "$dir/after"
  if ! { unzip -q "$BEFORE/$file" -d "$dir/before" && unzip -q "$AFTER/$file" -d "$dir/after"; }; then bad "can't unzip"; return; fi
  (cd "$dir/before" && find . -type f | sort) > "$dir/files.before"
  (cd "$dir/after" && find . -type f | sort) > "$dir/files.after"
  if ! diff -u "$dir/files.before" "$dir/files.after"; then bad "member lists differ"; return; fi
  local n=0 reencoded=0 f
  while read -r f; do
    cmp -s "$dir/before/$f" "$dir/after/$f" && continue
    case "$f" in
      *.png)
        if same_pixels "$dir/before/$f" "$dir/after/$f"; then reencoded=$((reencoded + 1)); continue; fi ;;
      *.opf|*core.xml)
        if diff -q <(strip_timestamps "$dir/before/$f") <(strip_timestamps "$dir/after/$f") >/dev/null; then continue; fi ;;
    esac
    bad "$f differs"; n=$((n + 1))
    case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.woff2|*.ttf|*.otf) ;; *) diff -u "$dir/before/$f" "$dir/after/$f" | head -20 ;; esac
  done < "$dir/files.before"
  [ "$n" -eq 0 ] && ok "$(wc -l < "$dir/files.before" | tr -d ' ') members match (ignoring timestamps; $reencoded PNGs re-encoded with identical pixels)"
}

fonts() {
  pdffonts "$1" | tail -n +3 | awk '{ sub(/^[A-Z]{6}\+/, "", $1); print $1, $(NF-4), $(NF-3) }' | sort | uniq -c
}

compare_pdf() {
  local file=$1 dir="$WORK/$1"
  mkdir -p "$dir/before" "$dir/after"
  local pb pa
  pb=$(pdfinfo "$BEFORE/$file" | awk '/^Pages:/ { print $2 }')
  pa=$(pdfinfo "$AFTER/$file" | awk '/^Pages:/ { print $2 }')
  if [ "$pb" = "$pa" ]; then ok "$pa pages in both"; else bad "page count: $pb before, $pa after"; fi
  if "${BK[@]}" config print.page_count 2>/dev/null | grep -qvx null; then
    if "${BK[@]}" check-pdf-page-count "$AFTER/$file" >/dev/null; then ok "matches print.page_count"; else bad "doesn't match print.page_count"; fi
  fi
  pdftotext -layout "$BEFORE/$file" "$dir/before.txt"; pdftotext -layout "$AFTER/$file" "$dir/after.txt"
  if diff -q "$dir/before.txt" "$dir/after.txt" >/dev/null; then ok "text identical"; else bad "text differs"; diff -u "$dir/before.txt" "$dir/after.txt" | head -20; fi
  if diff -q <(fonts "$BEFORE/$file") <(fonts "$AFTER/$file") >/dev/null; then ok "same fonts"; else bad "fonts differ"; diff <(fonts "$BEFORE/$file") <(fonts "$AFTER/$file"); fi
  local unembedded
  unembedded=$(pdffonts "$AFTER/$file" | tail -n +3 | awk '$(NF-4) == "no"' | wc -l | tr -d ' ')
  if [ "$unembedded" -eq 0 ]; then ok "all fonts embedded"; else bad "$unembedded fonts not embedded"; fi
  # Every page at low resolution: enough to catch a layout, image, or color
  # change without diffing hundreds of full-size bitmaps.
  pdftoppm -r 40 -gray -png "$BEFORE/$file" "$dir/before/p" &
  pdftoppm -r 40 -gray -png "$AFTER/$file" "$dir/after/p" &
  wait
  local d=0 page
  for page in "$dir"/before/*.png; do
    cmp -s "$page" "$dir/after/$(basename "$page")" || { d=$((d + 1)); echo "    page differs: $(basename "$page")"; }
  done
  if [ "$d" -eq 0 ]; then ok "every page renders identically"; else bad "$d pages render differently"; fi
}

check_pdfx() {
  if python3 - "$1" <<'PY'
import sys
import pikepdf
pdf = pikepdf.open(sys.argv[1])
version = str(pdf.trailer.Info.get("/GTS_PDFXVersion", ""))
sys.exit(0 if version == "PDF/X-1a:2001" and pdf.Root.get("/OutputIntents") else 1)
PY
  then ok "PDF/X-1a:2001 with an output intent"; else bad "not marked PDF/X-1a:2001 with an output intent"; fi
}

compared=0
for file in "$NAME.epub" "$NAME-kindle.epub" "$NAME-arc.epub" "$NAME-kindle-arc.epub" "$NAME.html" "$NAME.docx" "$NAME.pdf" "$NAME$PDFX_SUFFIX.pdf"; do
  if [ ! -f "$BEFORE/$file" ] && [ ! -f "$AFTER/$file" ]; then continue; fi
  echo "### $file"
  if [ ! -f "$BEFORE/$file" ] || [ ! -f "$AFTER/$file" ]; then bad "only in $([ -f "$BEFORE/$file" ] && echo before || echo after)"; continue; fi
  compared=$((compared + 1))
  case "$file" in
    *.epub|*.docx) compare_zip "$file" ;;
    *.html) if cmp -s "$BEFORE/$file" "$AFTER/$file"; then ok "identical"; else bad "differs"; diff <(tr '>' '\n' < "$BEFORE/$file") <(tr '>' '\n' < "$AFTER/$file") | head -20; fi ;;
    "$NAME$PDFX_SUFFIX.pdf") compare_pdf "$file"; check_pdfx "$AFTER/$file" ;;
    *.pdf) compare_pdf "$file" ;;
  esac
done

echo
if [ "$compared" -eq 0 ]; then echo "Parity: no outputs to compare in $BEFORE and $AFTER."; exit 1; fi
if [ "$fail" -eq 0 ]; then echo "Parity: all $compared outputs match."; else echo "Parity: FAILED (see ✗ above)."; fi
exit "$fail"

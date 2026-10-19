#!/usr/bin/env bash
set -euo pipefail

# Converts a PDF to PDF/X-1a:2001 (CMYK, no transparency, embedded fonts)
# for print distribution via IngramSpark or similar POD services.
#
# Usage:
#   book-kit convert-pdfx [input.pdf output.pdf [title]]
#
# With no arguments, converts the book's print PDF (dist/<basename>.pdf) to
# dist/<basename><output.pdfx_suffix>.pdf, titled print.pdfx_title: what
# `just pdfx` does, without rebuilding the PDF (e.g. in a CI job that
# downloaded it from another).
#
# Requirements:
#   - Ghostscript (gs) installed
#   - USWebCoatedSWOP.icc: $BOOK_KIT_ICC_PROFILE if set, else the book's
#     profiles/USWebCoatedSWOP.icc if present, else downloaded (sha256-pinned)
#     into the user cache by download-icc-profile.sh
#
# Runs from the book root (book-kit sets the working directory and
# BOOK_KIT_ROOT).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="${BOOK_KIT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [ $# -eq 0 ]; then
  bk() { node "$SCRIPT_DIR/../bin/book-kit.js" config "$1"; }
  dist="$(bk paths.dist)"
  name="$(bk output.basename)"
  set -- "$dist/$name.pdf" "$dist/$name$(bk output.pdfx_suffix).pdf" "$(bk print.pdfx_title)"
elif [ $# -lt 2 ]; then
  echo "Usage: book-kit convert-pdfx [input.pdf output.pdf [title]]" >&2
  exit 2
fi
INPUT="$1"
OUTPUT="$2"
TITLE="${3:-}"

ICC_PROFILE="$(bash "$SCRIPT_DIR/download-icc-profile.sh" --print-path)"
PDFX_DEF="$KIT_ROOT/profiles/pdfx-def.ps"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

# Check for Ghostscript
if ! command -v gs &>/dev/null; then
  echo "✗ Error: Ghostscript (gs) is not installed." >&2
  echo "" >&2
  echo "  Install it with:" >&2
  echo "    macOS:  brew install ghostscript" >&2
  echo "    Ubuntu: sudo apt-get install ghostscript" >&2
  echo "    Fedora: sudo dnf install ghostscript" >&2
  exit 1
fi

# Fetch (or locate) the ICC profile; download-icc-profile.sh verifies its sha256.
bash "$SCRIPT_DIR/download-icc-profile.sh" >/dev/null

# Check for input PDF
if [ ! -f "$INPUT" ]; then
  echo "✗ Error: Input PDF not found: $INPUT" >&2
  echo "  Build it first with: just pdf" >&2
  exit 1
fi

# Check for PDF/X definition file
if [ ! -f "$PDFX_DEF" ]; then
  echo "✗ Error: PDF/X definition file not found: $PDFX_DEF" >&2
  exit 1
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"

# ---------------------------------------------------------------------------
# Build a temporary pdfx-def.ps with the absolute ICC profile path
# ---------------------------------------------------------------------------

# Ghostscript needs an absolute path to the ICC profile in the PostScript
# definition file. We substitute the placeholder at runtime so the committed
# .ps file stays portable.
PDFX_DEF_TMP="$(mktemp "${TMPDIR:-/tmp}/pdfx-def.XXXXXX.ps")"
trap 'rm -f "$PDFX_DEF_TMP"' EXIT

# PostScript string escaping for the title: \, (, ) must be backslash-escaped.
PS_TITLE="$(printf '%s' "$TITLE" | sed -e 's/\\/\\\\/g' -e 's/(/\\(/g' -e 's/)/\\)/g')"
ICC_PROFILE="$ICC_PROFILE" PS_TITLE="$PS_TITLE" python3 -c '
import os, sys
src = open(sys.argv[1]).read()
src = src.replace("__ICC_PROFILE_PATH__", os.environ["ICC_PROFILE"]).replace("__TITLE__", os.environ["PS_TITLE"])
open(sys.argv[2], "w").write(src)
' "$PDFX_DEF" "$PDFX_DEF_TMP"

# ---------------------------------------------------------------------------
# Strip annotations (PDF/X-1a does not permit non-TrapNet/PrinterMark annots)
# ---------------------------------------------------------------------------
# WeasyPrint embeds hyperlink annotations that cause Ghostscript to revert the
# entire output to normal PDF when -dPDFX is set. Strip them first.

STRIPPED_TMP="$(mktemp "${TMPDIR:-/tmp}/book-kit-stripped.XXXXXX.pdf")"
trap 'rm -f "$PDFX_DEF_TMP" "$STRIPPED_TMP"' EXIT

python3 - "$INPUT" "$STRIPPED_TMP" <<'PYEOF'
import sys
import pikepdf

src, dst = sys.argv[1], sys.argv[2]
with pikepdf.open(src) as pdf:
    for page in pdf.pages:
        if "/Annots" in page:
            del page["/Annots"]
    pdf.save(dst)
PYEOF

# ---------------------------------------------------------------------------
# Convert to PDF/X-1a:2001
# ---------------------------------------------------------------------------

echo "Converting to PDF/X-1a:2001..."
echo "  Input:  $INPUT"
echo "  Output: $OUTPUT"
echo "  ICC:    $ICC_PROFILE"
echo ""

gs \
  -dBATCH \
  -dNOPAUSE \
  -dNOOUTERSAVE \
  -dNOSAFER \
  -dQUIET \
  -dPDFX \
  -dCompatibilityLevel=1.3 \
  -sDEVICE=pdfwrite \
  -sColorConversionStrategy=CMYK \
  -sProcessColorModel=DeviceCMYK \
  -dNOTRANSPARENCY \
  -dEmbedAllFonts=true \
  -dSubsetFonts=true \
  -dCompressFonts=true \
  -dCompressPages=true \
  -r300 \
  -dAutoRotatePages=/None \
  -dPDFSETTINGS=/prepress \
  -sOutputFile="$OUTPUT" \
  "$PDFX_DEF_TMP" \
  -f "$STRIPPED_TMP"

# ---------------------------------------------------------------------------
# Report results
# ---------------------------------------------------------------------------

if [ -f "$OUTPUT" ]; then
  input_size=$(wc -c < "$INPUT")
  output_size=$(wc -c < "$OUTPUT")

  # Format file sizes for human readability (pure bash, no bc dependency)
  format_size() {
    local bytes=$1
    if [ "$bytes" -ge 1048576 ]; then
      local mb=$((bytes / 1048576))
      local remainder=$(( (bytes % 1048576) * 10 / 1048576 ))
      echo "${mb}.${remainder} MB"
    elif [ "$bytes" -ge 1024 ]; then
      local kb=$((bytes / 1024))
      local remainder=$(( (bytes % 1024) * 10 / 1024 ))
      echo "${kb}.${remainder} KB"
    else
      echo "$bytes bytes"
    fi
  }

  echo ""
  echo "✓ PDF/X-1a:2001 conversion complete"
  echo "  Input:  $(format_size "$input_size") ($INPUT)"
  echo "  Output: $(format_size "$output_size") ($OUTPUT)"

  # Quick check: output should be non-trivially sized
  if [ "$output_size" -lt 1024 ]; then
    echo "" >&2
    echo "⚠ Warning: Output file is suspiciously small ($output_size bytes)." >&2
    echo "  The conversion may not have worked correctly." >&2
    exit 1
  fi

  echo ""
  echo "  Next steps:"
  echo "    - Validate with: gs -o /dev/null -sDEVICE=nullpage \"$OUTPUT\""
  echo "    - Upload to IngramSpark for print distribution"
else
  echo "✗ Error: Conversion failed. Output file was not created." >&2
  exit 1
fi

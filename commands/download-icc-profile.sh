#!/usr/bin/env bash
set -euo pipefail

# Locates or downloads the USWebCoatedSWOP.icc CMYK profile (the standard
# profile for U.S. web offset printing) for PDF/X-1a conversion.
#
# The kit doesn't ship the profile. In order of preference it uses:
#   1. $BOOK_KIT_ICC_PROFILE
#   2. profiles/USWebCoatedSWOP.icc in the book (a book may vendor it)
#   3. the user cache ($XDG_CACHE_HOME or ~/.cache)/book-kit/, downloading it
#
# --print-path prints the resolved path and exits without downloading.
#
# Whatever the source, the exact bytes are pinned by sha256: the mirrors below
# are untrusted, and a silently-changed CMYK profile would corrupt print color
# without any build error.

if [ -n "${BOOK_KIT_ICC_PROFILE:-}" ]; then
  ICC_FILE="$BOOK_KIT_ICC_PROFILE"
elif [ -f "${BOOK_ROOT:-.}/profiles/USWebCoatedSWOP.icc" ]; then
  ICC_FILE="${BOOK_ROOT:-.}/profiles/USWebCoatedSWOP.icc"
else
  ICC_FILE="${XDG_CACHE_HOME:-$HOME/.cache}/book-kit/USWebCoatedSWOP.icc"
fi
PROFILES_DIR="$(dirname "$ICC_FILE")"

if [ "${1:-}" = "--print-path" ]; then
  echo "$ICC_FILE"
  exit 0
fi
EXPECTED_SHA256="35f401731df11a4eba3502af632e51d68bc394bcb7d34632a331c1ba3f4a0bf6"

# Verify a file matches the pinned sha256. Uses sha256sum (Linux) or shasum
# (macOS), whichever is available.
verify_sha256() {
  local file="$1" actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    # Fail closed: an unverifiable profile could silently corrupt print color.
    echo "✗ Error: no sha256 tool (sha256sum or shasum) found; can't verify $file." >&2
    return 1
  fi
  [ "$actual" = "$EXPECTED_SHA256" ]
}

# Known public sources for USWebCoatedSWOP.icc (tried in order)
URLS=(
  "https://github.com/theeluwin/CMYK2RGB/raw/master/USWebCoatedSWOP.icc"
  "https://github.com/livgilbert/tiffr/raw/main/USWebCoatedSWOP.icc"
)

if [ -f "$ICC_FILE" ]; then
  if verify_sha256 "$ICC_FILE"; then
    echo "✓ ICC profile already exists and matches pinned sha256: $ICC_FILE"
    echo "  Size: $(wc -c < "$ICC_FILE") bytes"
    exit 0
  fi
  echo "✗ Error: $ICC_FILE exists but its sha256 does not match the pinned value." >&2
  echo "  Expected: $EXPECTED_SHA256" >&2
  echo "  Refusing to use it. Delete it to re-fetch, or restore the vendored copy." >&2
  exit 1
fi

mkdir -p "$PROFILES_DIR"

echo "Downloading USWebCoatedSWOP.icc CMYK ICC profile..."

for url in "${URLS[@]}"; do
  echo "  Trying: $url"
  if curl -fsSL --retry 3 --retry-delay 2 -o "$ICC_FILE" "$url"; then
    # Verify the file is non-empty and looks like an ICC profile
    # ICC profiles start with a 4-byte size field followed by "acsp" at offset 36
    file_size=$(wc -c < "$ICC_FILE")
    if [ "$file_size" -lt 100 ]; then
      echo "  ✗ Downloaded file too small ($file_size bytes), trying next source..."
      rm -f "$ICC_FILE"
      continue
    fi

    if ! verify_sha256 "$ICC_FILE"; then
      echo "  ✗ Downloaded file failed sha256 check (mirror may have changed), trying next source..."
      rm -f "$ICC_FILE"
      continue
    fi

    echo "✓ Downloaded ICC profile: $ICC_FILE ($file_size bytes), sha256 verified"
    exit 0
  else
    echo "  ✗ Failed to download from this source, trying next..."
    rm -f "$ICC_FILE"
  fi
done

echo "✗ Error: Could not download ICC profile from any known source." >&2
echo "" >&2
echo "  You can manually download USWebCoatedSWOP.icc and place it at:" >&2
echo "    $ICC_FILE" >&2
echo "" >&2
echo "  Sources:" >&2
echo "    - Adobe ICC profiles: https://www.adobe.com/support/downloads/iccprofiles/iccprofiles_win.html" >&2
echo "    - color.org: https://www.color.org/registry/index.xalter" >&2
exit 1

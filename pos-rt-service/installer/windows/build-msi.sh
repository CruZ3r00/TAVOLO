#!/usr/bin/env bash
# Build MSI installer per pos-rt-service.
#
# Compila con `wixl` (msitools) il sorgente WiX in `wix/` producendo
# `dist/win/pos-rt-service-<version>.msi`.
#
# Pre-requisiti:
#   - msitools / wixl >= 0.101 (Linux)         apt install wixl msitools
#     OPPURE WiX Toolset 3.x con candle+light  (su Windows / Wine)
#   - pos-rt-service.exe gia' costruito        (npm run pack:win)
#
# Variabili (override via env):
#   PRODUCT_VERSION   default: dal package.json
#   BINARY_SOURCE     default: dist/win/pos-rt-service.exe
#   OUT_DIR           default: dist/win
#   PRODUCT_CODE      default: nuovo GUID per ogni build (necessario per MajorUpgrade)
#
# Output:
#   $OUT_DIR/pos-rt-service-<version>.msi
#
# Uso:
#   ./installer/windows/build-msi.sh
#   PRODUCT_VERSION=1.2.3 ./installer/windows/build-msi.sh
#
set -euo pipefail

# Resolve paths relativi alla root del progetto pos-rt-service
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WIX_DIR="$SCRIPT_DIR/wix"

# --- Config con default override-abili ---
PRODUCT_VERSION="${PRODUCT_VERSION:-$(node -p "require('$PROJECT_ROOT/package.json').version" 2>/dev/null || echo 1.0.0)}"
BINARY_SOURCE="${BINARY_SOURCE:-$PROJECT_ROOT/dist/win/pos-rt-service.exe}"
OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/dist/win}"
PRODUCT_CODE="${PRODUCT_CODE:-$(python3 -c 'import uuid; print(str(uuid.uuid4()).upper())')}"

OUT_FILE="$OUT_DIR/pos-rt-service-${PRODUCT_VERSION}.msi"

echo "==> pos-rt-service MSI build"
echo "  PRODUCT_VERSION = $PRODUCT_VERSION"
echo "  PRODUCT_CODE    = $PRODUCT_CODE  (new for this build)"
echo "  BINARY_SOURCE   = $BINARY_SOURCE"
echo "  OUT_FILE        = $OUT_FILE"
echo

# --- Pre-flight ---
if [ ! -f "$BINARY_SOURCE" ]; then
  echo "ERROR: binario non trovato: $BINARY_SOURCE"
  echo "Esegui prima:  cd $PROJECT_ROOT && npm run pack:win"
  exit 2
fi

if ! command -v wixl >/dev/null 2>&1; then
  echo "ERROR: wixl non installato."
  echo "  Debian/Ubuntu:  sudo apt install wixl msitools"
  echo "  In alternativa: usa WiX Toolset 3 (Windows) — vedi installer/windows/README.md"
  exit 3
fi

mkdir -p "$OUT_DIR"

# --- Build ---
# wixl 0.101 risolve File@Source e Icon@SourceFile relativamente al CWD,
# non al .wxs path. Quindi facciamo cd WIX_DIR e passiamo path relativi.
echo "==> wixl compile..."
cd "$WIX_DIR"
BINARY_REL=$(realpath --relative-to="$WIX_DIR" "$BINARY_SOURCE")
wixl --verbose -a x64 \
  -D "ProductVersion=$PRODUCT_VERSION" \
  -D "ProductCode=$PRODUCT_CODE" \
  -D "BinarySource=$BINARY_REL" \
  -D "LicenseRtf=License.rtf" \
  -D "IconFile=AppIcon.ico" \
  -o "$OUT_FILE" \
  Product.wxs Directories.wxs Components.wxs Service.wxs

echo
echo "==> Built: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo
echo "Verifica struttura MSI:"
echo "  msiinfo suminfo \"$OUT_FILE\""
echo "  msiinfo tables  \"$OUT_FILE\""
echo
echo "Authenticode signing (Windows, opzionale ma raccomandato):"
echo '  signtool sign /f cert.pfx /p <pwd> /tr http://timestamp.digicert.com /td sha256 /fd sha256 \'
echo '          "'$(basename "$OUT_FILE")'"'
echo
echo "Install (Windows, admin elevato richiesto):"
echo "  msiexec /i \"$(basename "$OUT_FILE")\" /qb /l*v install.log"

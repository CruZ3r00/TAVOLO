#!/usr/bin/env bash
# Installer macOS per pos-rt-service (launchd daemon).
set -euo pipefail

BIN_SRC="${1:-./dist/macos/pos-rt-service}"
BIN_DST="/usr/local/bin/pos-rt-service"
DATA_DIR="/Library/Application Support/PosRtService"
PLIST_DST="/Library/LaunchDaemons/com.posrtservice.plist"

if [[ "$EUID" -ne 0 ]]; then
  echo "Richiede sudo." >&2
  exit 1
fi

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Binario non trovato: $BIN_SRC" >&2
  exit 2
fi

echo "► Creazione directory..."
mkdir -p "$DATA_DIR/logs" "$DATA_DIR/db"
chown -R root:wheel "$DATA_DIR"
chmod 0755 "$DATA_DIR"

echo "► Copia binario..."
cp "$BIN_SRC" "$BIN_DST"
chmod 0755 "$BIN_DST"

echo "► Copia plist..."
cp "$(dirname "$0")/com.posrtservice.plist" "$PLIST_DST"
chown root:wheel "$PLIST_DST"
chmod 0644 "$PLIST_DST"

echo "► Caricamento daemon..."
launchctl bootstrap system "$PLIST_DST" || launchctl load "$PLIST_DST"

echo "✓ Installazione completata."
echo "► Log:          tail -f '$DATA_DIR/logs/stdout.log'"
echo "► UI pairing:   apri http://127.0.0.1:<porta>/ui/pair.html"

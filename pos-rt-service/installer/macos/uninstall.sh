#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Richiede sudo." >&2
  exit 1
fi

PLIST="/Library/LaunchDaemons/com.posrtservice.plist"
launchctl bootout system "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
rm -f /usr/local/bin/pos-rt-service

echo "Servizio rimosso."
echo "Dati in /Library/Application Support/PosRtService conservati."

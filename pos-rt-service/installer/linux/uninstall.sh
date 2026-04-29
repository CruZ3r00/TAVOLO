#!/usr/bin/env bash
# Uninstaller Linux per pos-rt-service.
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Richiede root." >&2
  exit 1
fi

systemctl stop pos-rt-service.service || true
systemctl disable pos-rt-service.service || true
rm -f /etc/systemd/system/pos-rt-service.service
rm -f /usr/local/bin/pos-rt-service
systemctl daemon-reload

echo "Servizio rimosso."
echo "Dati in /var/lib/pos-rt-service conservati. Rimuovi manualmente se desiderato:"
echo "  sudo rm -rf /var/lib/pos-rt-service"

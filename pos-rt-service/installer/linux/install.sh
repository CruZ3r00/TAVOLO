#!/usr/bin/env bash
# Installer Linux per pos-rt-service.
# Da eseguire come root.
set -euo pipefail

BIN_SRC="${1:-./dist/linux/pos-rt-service}"
INSTALL_DIR="/opt/pos-rt-service"
BIN_DST="/usr/local/bin/pos-rt-service"
DATA_DIR="/var/lib/pos-rt-service"
SERVICE_FILE="/etc/systemd/system/pos-rt-service.service"
SERVICE_USER="posrt"

if [[ "$EUID" -ne 0 ]]; then
  echo "Questo script richiede i permessi di root." >&2
  exit 1
fi

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Binario non trovato: $BIN_SRC" >&2
  echo "Uso: sudo $0 <path/al/binario>" >&2
  exit 2
fi

echo "► Creazione utente di servizio '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "► Creazione directory..."
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR"
install -d -m 0755 "$INSTALL_DIR"

echo "► Copia binario..."
install -m 0755 "$BIN_SRC" "$BIN_DST"

echo "► Copia systemd unit..."
cp "$(dirname "$0")/pos-rt-service.service" "$SERVICE_FILE"
chmod 0644 "$SERVICE_FILE"

echo "► Abilitazione servizio..."
systemctl daemon-reload
systemctl enable pos-rt-service.service
systemctl start pos-rt-service.service

sleep 2
systemctl status pos-rt-service.service --no-pager || true

echo ""
echo "✓ Installazione completata."
echo "► Log:          journalctl -u pos-rt-service -f"
echo "► Configurazione pairing: apri http://127.0.0.1:<porta>/ui/pair.html"
echo "  (porta visibile in $DATA_DIR/db oppure nei log del servizio)"

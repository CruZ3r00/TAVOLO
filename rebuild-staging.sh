#!/bin/bash
set -euo pipefail

BASE="/var/www/tavolo/TAVOLO-staging"
FRONTEND="$BASE/vuejs/frontend"
STRAPI="$BASE/strapi"

echo "== Rebuild staging =="

echo "1) Build frontend"
cd "$FRONTEND"
npm run build

echo "2) Assicuro uploads"
mkdir -p "$STRAPI/public/uploads"
chmod 755 "$STRAPI/public/uploads"

echo "3) Copio frontend in Strapi public SENZA toccare uploads"
rsync -av --delete \
  --exclude 'uploads/***' \
  "$FRONTEND/dist/" \
  "$STRAPI/public/"

echo "4) Build Strapi"
cd "$STRAPI"
npm run build

echo "5) Restart PM2"
pm2 restart tavolo-strapi-staging

echo "6) Check"
curl -fsS http://127.0.0.1:1437 >/dev/null || true
pm2 list

echo "OK rebuild staging completato"

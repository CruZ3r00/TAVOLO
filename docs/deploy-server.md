# Server deploy checklist

This repository is prepared to be cloned on a server and started by adding
environment files only. Use Node 20 LTS, matching `.nvmrc`.

## Branch state

The current working branch is `master`. The branch named `deploy` is behind
`master` and does not contain the recent mail, password reset, billing, POS/RT,
OCR, registration, and production-hardening work.

Before deploying from `deploy`, bring these changes into it:

```bash
git checkout deploy
git merge master
```

Then include the current uncommitted deployment/auth hardening files before
building the server branch:

- `strapi/config/middlewares.js`
- `strapi/src/utils/production-checks.js`
- `strapi/tests/utils.test.js`
- `strapi/src/extensions/users-permissions/strapi-server.js`
- `strapi/src/api/pos-device/controllers/pos-device.js`
- `strapi/src/api/pos-device/routes/custom-pos-device.js`
- `vuejs/frontend/src/Pages/Auth/Login.vue`
- `vuejs/frontend/src/Pages/ChoosePlan.vue`
- `.nvmrc`
- `.gitignore`
- `strapi/.env.production.example`
- `strapi/public/downloads/.gitkeep`
- `vuejs/frontend/.env.production.example`
- `docs/deploy-server.md`

## Backend env

On the server, copy `strapi/.env.production.example` to `strapi/.env` and fill
the real values. Do not commit the real `.env`.

Important production requirements enforced at boot:

- `PUBLIC_URL`, `FRONTEND_URL`, and every `CORS_ORIGIN` entry must use HTTPS.
- `CORS_ORIGIN` must be only the public frontend origin, never `*`, localhost,
  or LAN addresses.
- Database SSL must be enabled.
- If `OCR_SERVICE_URL` is set, `OCR_SERVICE_INTERNAL_TOKEN_REQUIRED=true` and
  `OCR_SERVICE_INTERNAL_TOKEN` must be set.
- Stripe must use live keys and different live price IDs for starter and pro.
- Resend SMTP uses `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, and the
  Resend API key as `SMTP_PASS`.

`OCR_SERVICE_URL` must point to the OCR microservice endpoint. Ollama can stay
behind that service on the server.

## APK download

The Android APK button in the profile downloads a real file when one of these
is configured:

- put the APK at `strapi/public/downloads/pos-rt-mobile-latest.apk`;
- or set `POS_ANDROID_APK_PATH=/absolute/path/to/app.apk`;
- or set `POS_ANDROID_APK=https://cdn.example.com/app.apk` for an external URL.

If you use the local file option, keep `POS_ANDROID_APK` empty. The frontend
will receive `/api/pos-devices/downloads/android-apk` from Strapi and the
browser will download the APK directly.

## Frontend env

On the server or build machine, copy `vuejs/frontend/.env.production.example`
to the environment used by Vite and set:

```bash
VITE_API_BASE_URL=https://api.comfortables.eu
```

If Supabase is used in the public frontend flow, also provide:

```bash
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

## Build checks

Run these before publishing:

```bash
cd strapi
npm ci
npm test
npm run build

cd ../vuejs/frontend
npm ci
npm run build
```

The backend intentionally refuses to start in `NODE_ENV=production` if the env
still contains local/test values.

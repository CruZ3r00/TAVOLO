# Security Hardening Plan

Local branch: `security-hardening`

This file tracks the local remediation work for the security findings from the
read-only audit and authenticated smoke tour. Keep each fix scoped, tested, and
reviewable.

## Phase 0 - Baseline And Control

Status: complete

- [x] Create local hardening branch.
- [x] Record the existing security findings in a single local checklist.
- [x] Run baseline verification commands before application fixes.
- [x] Confirm product/security decisions that affect behavior or compatibility.

Baseline commands:

```sh
cd strapi && npm test
cd vuejs/frontend && npm run build
cd pos-rt-service && npm test
cd ocr-service && .venv/bin/python -m unittest discover -s tests
```

Baseline results on 2026-05-12:

- Strapi: `npm test` passed, 4/4.
- Frontend: `npm run build` passed. Existing warning: chunks over 500 kB.
- POS RT service: sandboxed run failed because tests tried to create logs under
  `~/Library/Application Support/PosRtService`; rerun outside sandbox with
  `APP_DATA_DIR=/tmp/tavolo-pos-test-data LOG_LEVEL=silent npm test` passed,
  32/32.
- OCR: local `python3` is Python 3.14 and is not compatible with the pinned
  `pymupdf==1.24.5` install path. Installed Homebrew `python@3.12`, created
  `ocr-service/.venv`, installed `requirements.txt`, and
  `.venv/bin/python -m unittest discover -s tests` passed, 22/22.

Known pre-existing local change not owned by this hardening pass:

- `strapi/.strapi-updater.json`

## Phase 1 - Tenant Escape And Auth Core

- [x] Remove staff inference from username format.
- [x] Reserve staff username namespaces during registration/profile update.
- [x] Add tests proving `owner.role` usernames cannot impersonate staff.
- [x] Enforce 2FA during login before issuing the final JWT.
- [x] Hash recovery codes.
- [x] Require password or TOTP before disabling 2FA or regenerating recovery
  codes.
- [x] Use safe site slugs for generated site files.
- [x] Add path containment checks before writing generated public site files.

Note: mail/recovery prerequisites were fixed first, then 2FA login enforcement
was enabled with a short-lived challenge token and final JWT issuance only after
TOTP or recovery-code verification.

## Phase 2 - Public Surfaces And Upload

- [x] Restrict logo/media binding to files owned by the authenticated user.
- [x] Allow only safe raster image MIME types for restaurant logos.
- [x] Add size and image metadata validation for logo uploads.
- [x] Add public take-away rate limiting.
- [x] Add public take-away idempotency controls.
- [ ] Review and make core Strapi route permissions explicit.

## Phase 3 - POS And Realtime

- [x] Consume POS pairing tokens atomically.
- [ ] Add concurrency test for one-token/two-register attempts.
- [x] Remove WebSocket token authentication from query strings.
- [x] Accept POS WebSocket token only through `Authorization: Bearer`.

## Phase 4 - Mobile And OCR

- [ ] Move mobile device token storage to platform secure storage.
- [ ] Disable mobile backup for secrets.
- [ ] Disable cleartext traffic outside debug-specific configuration.
- [x] Make OCR token requirement fail-closed by default.
- [x] Require OCR token configuration at service boot when auth is enabled.
- [ ] Add OCR resource limits for file size, PDF pages, pixels, concurrency, and
  processing timeout.

## Phase 5 - Sessions, CSP, Production Hardening

- [ ] Decide target session model: HttpOnly refresh cookie plus short access
  token, or an interim short-lived JWT mitigation.
- [ ] Tighten CSP and remove `unsafe-inline` where feasible.
- [ ] Introduce explicit `APP_ENV`.
- [ ] Fail closed when public production URLs are combined with dev/insecure
  settings.

## Phase 6 - DB/Supabase

- [ ] Enable DB SSL for Supabase pooler connections.
- [ ] Verify `pg_stat_ssl.ssl=true` dynamically.
- [ ] Review broad `anon`/`authenticated` grants.
- [ ] Remove or constrain `anon SELECT true` on `order_realtime_events`.

## Phase 7 - Dependencies

- [ ] Upgrade Strapi dependencies in a dedicated changeset.
- [ ] Upgrade frontend build/runtime dependencies in a dedicated changeset.
- [ ] Upgrade Capacitor/mobile dependencies in a dedicated changeset.
- [ ] Audit and upgrade OCR Python dependencies.

## Decisions Needed

- [x] Should existing staff-style usernames be migrated or rejected in place?
  Decision: block staff-style username inference. Staff authorization must come
  from explicit DB relationships, not username strings.
- [x] What backward compatibility window, if any, is allowed for POS WebSocket
  query-string tokens?
  Decision: remove query-string token support immediately, with no compatibility
  window.
- [x] Mail/auth sequencing: email flows must be fixed before enforcing 2FA login
  challenges, to avoid account recovery and onboarding problems.
  Implemented prerequisite: production SMTP settings are now validated,
  nodemailer auth is only configured when credentials exist, and the frontend
  verification resend screen calls Strapi's real
  `/api/auth/send-email-confirmation` endpoint instead of a placeholder route.
- [x] Should SVG logos be banned entirely, or allowed only after sanitization?
  Decision: ban SVG logos; allow only safe raster formats.
- [x] Should public take-away use CAPTCHA/Turnstile immediately or only after
  rate limiting and idempotency are in place?
  Decision: implement rate limiting and idempotency now; no CAPTCHA/Turnstile in
  this tranche.

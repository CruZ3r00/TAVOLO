# Strapi backend (`strapi/`)

Strapi v5 CMS + admin. REST API on `http://localhost:1337`. MySQL/SQLite/Postgres via env (`config/database.js`). Hosts auth + internal services. UI/labels/comments in Italian.

> Workflow / core principles vivono nel `CLAUDE.md` root del monorepo.

## Content Types
**Core:**
- **Menu** — links a user (`fk_user` 1-1) to many Elements (`fk_elements` 1-N).
- **Element** — `name`, `price`, `category`, `image`, `ingredients` (JSON), `allergens` (JSON). Snapshotted on order item creation.
- **WebsiteConfig** — `site_url`, `restaurant_name`, `logo`, `coperti_invernali` (req, ≥1), `coperti_estivi` (opt, defaults to invernali), `fk_user` (1-1). Used for capacity checks.
- **Table** — `number` (unique per user), `seats` (1..100), `area` (interno|esterno, def interno), `status` (free|occupied|reserved, denormalized), `fk_user` (N-1). Uniqueness `(number, fk_user)` enforced in controller.
- **Reservation** — `customer_name`, `phone`, `customer_email`, `date`, `time`, `datetime` (computed), `slot_start` (30min bucket), `number_of_people` (1..1000), `notes`, `is_walkin` (def false), `status` (pending|confirmed|at_restaurant|completed|cancelled, def pending), `fk_user`, `fk_table` (opt), `fk_order` (1-1, opt). Pending/cancelled don't consume capacity. Capacity via transactional lock (ADR-0001).
- **Order** — `status` (active|closed), `service_type` (table|takeaway, def table), `takeaway_status` (pending_acceptance|confirmed|sent_to_departments|ready|picked_up|closed), `customer_name/_phone/_email`, `pickup_at`, `sent_to_departments_at`, `ready_at`, `picked_up_at`, `opened_at`, `closed_at`, `total_amount` (server-derived), `payment_status` (unpaid|paid), `payment_reference`, `fiscal_status` (pending|completed|failed|not_required), `fiscal_receipt_id`, `fiscal_event_id`, `lock_version` (optimistic), `covers`, `fk_table` (null for takeaway), `fk_user`, `fk_items` (1-N OrderItem), `fk_reservation` (opt). Invariant: 1 active order/table/user (dine-in).
- **OrderItem** — `name` (snapshot), `price` (snapshot), `quantity` (≥1), `category`, `course` (1..12, kitchen routing), `notes`, `status` (taken|preparing|ready|served, def taken), `fk_order`, `fk_element` (opt).

**Internal/stats** (routes: []):
- **MenuElementStat** — per-Element counter (lifetime orders, last_ordered). Updated by `services/stats.js`.
- **RestaurantDailyStat** — daily aggregate per user: revenue, customers/orders/walkin/reservation/takeaway counts, items_sold.
- **OrderArchive** — immutable snapshot on order close: `date`, `items_json`, customer/payment/fiscal fields, `table_number`, `service_type`, `covers`. Written by `services/order-close-finalizer.js`.

**POS integration:**
- **PosDevice** — `device_token_hash` (SHA256), `device_name`, `device_model`, `os_type`, `last_heartbeat`, `config_json`, `fk_user`. Paired via PosPairingToken.
- **PosJob** — async queue: `kind` (order.close|print.receipt|payment.charge|payment.refund), `status` (pending|dispatched|acked_success|acked_failure|cancelled), `priority`, `event_id` (idempotency), `payload`, `outcome`, timestamps. Internal only.
- **PosPairingToken** — single-use: `token_hash` (SHA256), `expires_at` (15min TTL), `fk_user`, `consumed_at`.

## Public API (no auth)
- **`GET /api/menus/public/:userDocumentId`** — full menu. Resp: `{ data: { restaurant_name, logo_url, categories[], elements[] } }`.
- **`POST /api/reservations/public/:userDocumentId`** — external-site reservation. Rate-limited 5/10min/IP. Body: `{ customer_name, phone, date, time, number_of_people (1..1000), notes? }`. Forces `status=pending`. Errors: `RESTAURANT_NOT_FOUND` (404), `INVALID_PAYLOAD` (400).
- **`GET /api/takeaways/public/:userDocumentId`** — active takeaway orders (`confirmed|sent_to_departments|ready`) for kiosk displays.
- **`POST /api/takeaways/public/:userDocumentId`** — external takeaway. Body: `{ customer_name, phone, email?, items: { name, price, quantity }[], pickup_at, notes? }`. Errors: 404/400/422 (`INVALID_PICKUP_TIME`).

## Menu Import (OCR) API
In `src/api/menu/controllers/menu.js` + `routes/custom-menu.js`.
- **`POST /api/menus/import/analyze`** — multipart `file` (PDF/PNG/JPG/JPEG/WEBP, ≤20 MB). Validates MIME + magic, saves under `MENU_UPLOAD_DIR/<slug>/<ts>_<rand>.<ext>`, calls OCR `POST /process`. Resp: `{ data: { elements, count, ocr_confidence, warnings, source_file } }` with per-element `_missing` flags. Errors: `LLM_UNAVAILABLE` (503), `OCR_UNAVAILABLE` (503), `OCR_TIMEOUT` (504), `OCR_INVALID_RESULT` (422).
- **`POST /api/menus/import/bulk`** — `{ mode: "append"|"replace", elements: [...] }`. Knex transaction, scoped to user's menu; replace = atomic swap. Cap 200 elements/req.

## Reservations API (auth)
In `src/api/reservation/controllers/reservation.js` + `routes/custom-reservation.js`. Design: `docs/adr/0001-reservations-system.md`.
- **`POST /api/reservations`** — Body: `{ customer_name, phone, date, time, number_of_people (1..1000), notes?, status? (pending|confirmed, def confirmed) }`. Transactional capacity check (`SELECT … FOR UPDATE`). Errors: `INVALID_PAYLOAD` (400), `CAPACITY_NOT_CONFIGURED` (409), `OVERBOOKING` (409, includes capacity/current/requested/slot_start), `RESERVATION_CONTENTION` (503 after 3 retries).
- **`POST /api/reservations/walkin`** — `{ customer_name, phone?, number_of_people, notes? }`. `is_walkin=true`, status=pending, no capacity check.
- **`POST /api/reservations/:documentId/seat`** — `{ table_id }`. Assigns `fk_table`, FSM advance pending→confirmed. Errors: `TABLE_NOT_FOUND` (404), `NOT_OWNER` (403).
- **`GET /api/reservations`** — Query: `status` (CSV), `from`, `to`, `page`, `pageSize` (def 1/25, max 100). Sorted `datetime:asc`.
- **`PATCH /api/reservations/:documentId/status`** — `{ status }`. Capacity re-check on promotion. Errors: `NOT_OWNER` (403), `INVALID_TRANSITION` (400), `RESERVATION_NOT_FOUND` (404).

**State machine:** pending → confirmed|cancelled; confirmed → at_restaurant|cancelled; at_restaurant → completed. Capacity counts confirmed+at_restaurant. Terminals: completed, cancelled.
**Concurrency:** `strapi.db.transaction` + `FOR UPDATE` (PG) / `BEGIN IMMEDIATE` (SQLite). Retry 3× with 50/150/450ms ±25% jitter (`src/utils/db-lock.js`).

## Orders & Tables API (auth)
In `src/api/{table,order}/controllers/*` + `routes/custom-*.js`. Design: ADR-0002, ADR-0005.

### Tables
- **`GET /api/tables`** — `{ data, meta: { total } }`.
- **`POST /api/tables`** — `{ number, seats, area? }`. Errors: `TABLE_ALREADY_EXISTS` (409), `INVALID_PAYLOAD` (400).
- **`PATCH /api/tables/:documentId`** — blocked if occupied (409 `TABLE_ALREADY_OCCUPIED`).
- **`DELETE /api/tables/:documentId`** — blocked if occupied. 204.

### Orders (dine-in)
- **`POST /api/orders`** — `{ table_id, service_type:"table", covers? }`. Sets `table.status='occupied'`. Errors: `TABLE_NOT_FOUND` (404), `TABLE_ALREADY_OCCUPIED` (409), `ORDER_CONTENTION` (503), `NOT_OWNER` (403), `INVALID_PAYLOAD` (400).
- **`POST /api/takeaways`** — `{ service_type:"takeaway", customer_name, customer_phone?, customer_email?, pickup_at, items: { name, price, quantity }[] }`. `takeaway_status=pending_acceptance`.
- **`GET /api/orders`** — Query: `status`, `service_type`, `table`, `from`, `to`, `page`, `pageSize` (def 1/25, max 100). Sort `opened_at:desc`.
- **`GET /api/orders/:documentId`** — full order + items + table + reservation. Errors: 404, 403.
- **`POST /api/orders/:documentId/items`** — from menu `{ element_id, quantity, notes?, lock_version? }` (server snapshots) or free-form `{ name, price, quantity, category?, course?, notes?, lock_version? }`. Recalcs total, increments `lock_version`. Pro-plan dine-in: routes via `course`/category. Resp 201: `{ data: { item, order: { total_amount, lock_version } } }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId`** — `{ quantity?, notes?, course?, lock_version? }`. Only if `item.status=taken` && `order.status=active`. Errors: `ITEM_NOT_EDITABLE` (409), `STALE_ORDER` (409).
- **`DELETE /api/orders/:documentId/items/:itemDocumentId`** — same guards. `{ lock_version? }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId/status`** — `{ status }`. No `lock_version` (FSM unidirectional). Errors: `INVALID_ITEM_TRANSITION` (400), `ORDER_NOT_ACTIVE` (409).
- **`POST /api/orders/:documentId/close`** — `{ payment_method?:"simulator"|"pos"|"fiscal_register", lock_version? }`. Strategy-pattern payment. On success: closes order, fiscal fields updated, queues PosJob, `table.status='free'` (dine-in), creates OrderArchive. Errors: `ORDER_NOT_ACTIVE` (409), `STALE_ORDER` (409), `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503), `ORDER_CONTENTION` (503), `FISCAL_REGISTER_ERROR` (500).

### Takeaway workflow (PATCH on `/api/takeaways/:documentId/...`)
- `accept` → `takeaway_status=confirmed`.
- `reject` → `takeaway_status=closed`, `status=closed`.
- `send` → `takeaway_status=sent_to_departments`, sets `sent_to_departments_at`.
- `ready` → `takeaway_status=ready`, sets `ready_at`.
- `pickup` → `takeaway_status=picked_up`, sets `picked_up_at`, `status=closed`, `payment_status=paid`.

**Item FSM:** taken → preparing → ready → served (no backward). Editable only when taken.
**Order FSM:** active → closed (dine-in); takeaway has its own FSM above.
**Optimistic locking:** client sends `lock_version`; server returns 409 `STALE_ORDER` on mismatch; incremented per mutation.
**Concurrency:** same as reservations (FOR UPDATE / BEGIN IMMEDIATE, 3× retry, final 503 `ORDER_CONTENTION`).
**Category routing:** pro plan only — maps `course`/`element.category` → CUCINA/BAR/PIZZERIA/CUCINA_SG. Starter forces all to CUCINA.

## Payment Service
Strategy pattern at `src/services/payment/`. Factory `index.js` selects via `payment_method` param or `PAYMENT_STRATEGY` env (def `simulator`).
- `simulator` — local sim. Env: `PAYMENT_SIMULATOR_LATENCY_MS` (def 200), `PAYMENT_SIMULATOR_FAILURE_RATE` (def 0). Returns `{ success, transactionId:"SIM-<uuid>", timestamp, amount, currency }`.
- `pos` — PosJob `kind=payment.charge`, awaits ack. Stub for SumUp/Nexi.
- `fiscal_register` — same pattern via pos-rt-service. Stub for RT.
**Errors:** `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503).

## Account & Billing API (auth)
In `src/api/{account,billing}/controllers/*`.

### Account
- `GET /api/account/profile` — name, email, restaurant_name, subscription, staff list.
- `PATCH /api/account/password` — `{ old_password, new_password }`.
- `POST /api/account/2fa/enable` — email-based; returns `qr_code` (future TOTP).
- `POST /api/account/2fa/confirm` — `{ code }`.
- `POST /api/account/2fa/disable` — `{ password }`.
- `POST /api/account/2fa/recovery` — returns encrypted recovery codes.
- `DELETE /api/account/destroy` — `{ password, confirmation:"DELETE" }`. 204 (async purge).
- `GET /api/account/website-config` — alias for WebsiteConfig read.
- `POST /api/account/staff` — `{ email, role }`. Sends invite. 201.
- `GET /api/account/staff` — list with roles.
- `DELETE /api/account/staff/:staffUserId` — owner only. 204.
- `GET /api/account/category-routing` — pro only. `{ categories: { name: role } }`.
- `PUT /api/account/category-routing` — pro only.

### Billing
- `GET /api/billing/status` — `{ plan, status (active|trialing|past_due|cancelled), current_period_start/end, items[] }`.
- `POST /api/billing/checkout` — `{ plan_id }` → `{ sessionId, url }` (Stripe).
- `POST /api/billing/sync-checkout` — `{ event_id }`. Webhook reconciliation.
- `POST /api/billing/portal` — Stripe customer portal URL.
- `POST /api/billing/change-plan` — `{ plan_id }`. Cancels + recreates.
- `POST /api/billing/cancel` — returns cancellation date.
- `POST /api/billing/reactivate` — restore cancelled sub.
- `POST /api/billing/webhook` (public, Stripe-signed) — handles charge.succeeded, customer.subscription.updated/deleted.

## Ingredients API (auth)
- `GET /api/ingredients` — `[{ id, name, allergens }]`.
- `PUT /api/ingredients/toggle` — `{ ingredient_id, available }`.

## POS Devices API (auth)
In `src/api/pos-device/controllers/pos-device.js` + `routes/custom-pos-device.js`.

### Pairing
- `POST /api/pos-devices/register` → `{ pairing_token, expires_at }` (15min).
- `POST /api/pos-devices/register-by-token` (X-Device-Token on first call) — `{ pairing_token, device_name, device_model, os_type }` → `{ device_token }`. 201.
- `POST /api/pos-devices/revoke` — `{ device_id }`. 204.

### Job dispatch (X-Device-Token)
- `GET /api/pos-devices/me/jobs` — pending jobs `[{ id, kind, priority, payload, event_id }]`.
- `POST /api/pos-devices/me/ack-job` — `{ job_id, status (acked_success|acked_failure), outcome }`.
- `POST /api/pos-devices/me/heartbeat` — `{ timestamp }`.
- `POST /api/pos-devices/me/config` — returns `{ config_json, supported_payment_methods, supported_printers }`.
- `POST /api/pos-devices/me/push-token` — `{ push_token, platform (fcm|apns) }`.

### WebSocket
- `/ws/pos` (Bearer device_token) — bidirectional push/ack. Falls back to polling.

### Admin
- `GET /api/pos-devices/installers` (public) — `[{ os, version, download_url, checksum }]`.
- `GET /api/pos-devices/downloads/:osType/:version/:filename` (public, rate-limited) — streaming download.

## Database Migrations
JS migrations in `database/migrations/`, idempotent, auto-run on `npm run dev`:
- `001_operational_indexes.js` — indexes (order.opened_at, reservation.datetime, …).
- `002_order_item_course_fields.js` — adds `category` and `course` (1..12) to OrderItem.
- `003_takeaway_fields.js` — Order takeaway fields (service_type, takeaway_status, customer_*, pickup_at, *_at timestamps).

`realtime_relation_link_patch.sql` and `…_no_dollar.sql` are equivalent; the no-dollar variant is for PG without `$1` syntax (obsolete; use the first).

## Development Commands
`npm install && npm run dev` (auto-reload + migrations) / `npm run build` / `npm run start` / `npm run seed`.

## Tech debt / dead code
- **Staff/category routing:** `category_routing_*.sql` works but plan-gated to pro. Starter forces all to CUCINA. Activate dynamically on starter→pro upgrade.

## WORKFLOW ORCHESTRATION
  ### 1. Plan Mode Default
  - Enter in plan mode for ANY non-trivial task (3+ steps or architectural decisions)
  - If something goes sideways, STOP and replan immediately
  - Use plan mode for verification steps, not just building
  - Write detailed specs upfront to reduce ambiguity
  ### 2. Subagent strategy
  - Use subagent (starting with PMO) to keep the main context clean
  - Offload research, exploration and parallel analysis to subagents
  - Decide by yourself when it is needed more compute and start team agent
  - One task per sub-agent, also if you need to start multiple backend agent (or others) for focused execution
  ### 3. Self-improvement loop
  - After ANY correction from the user: update lessons.md with the pattern
  - After ANY bug or error in your own code: update lessons.md with the pattern
  - Write rules for yourself that prevent the same mistake
  - ruthlessly iterate on these lessons until mistake rate drops
  - Review lessons.md on start for relevant project
  ### 4. Verification before done
  - Never mark a task complete without proving it works
  - Diff behaviour between main and your changes when relevant
  - Ask yourself: "Would a staff engineer approve this?"
  - Run tests, check logs, demonstrate correctness
  ### 5. Demand Elegance
  - For non-trivial changes: pause and ask: "is there a more elegant way?"
  - If a fix feels hacky: "Knowing everything i know now, implement the elegant solution"
  - Skip this for simple, obvious fixes -- DO NOT over-engineer
  - Challenge your own work before presenting it
  ### 6. Autonomous bug fixing
  - When given a bug report: just fix it. Don't ask for hand-holding
  - Point at logs, errors, failing tests -- then resolve them
  - Zero context switching required from the user
  - Go fix failing CI tests without told how
## TASK MANAGEMENT
  1. *CONTEXT FRIENDLY*: Read the context from code-review-graph when possible or from CLAUDE.md in the projects
  2. *PLAN FIRST*: Write plan to todo.md with checkable items
  3. *VERIFY PLAN*: Check in before starting implementation
  4. *TRACK PROGRESS*: Mark items complete as you go
  5. *EXPLAIN CHANGES*: High-level summary at each step
  6. *DOCUMENT RESULTS*: Add review section to todo.md
  7. *CAPTURE LESSONS*: Update lessons after corrections
##CORE PRINCIPLES
  - *Simplicity First*: Make every change as simple as possible. Impact minimal code.
  - *No laziness*: Find root causes. No temporary fixes. Senior developer standards
  - *Minimal Impact*: Only touch what's necessary. No side effects with new bugs
## Project Overview
Multi-feature restaurant management system. Restaurant owners register, build their digital menu, manage table reservations and in-room/takeaway orders, configure their external website integration, and integrate with POS hardware. The system exposes public APIs for table reservations and menu queries from external websites. The project is in Italian (UI labels, route names, comments).

### Browser & Device Support
The product is designed as a modern application optimized for recent browsers and devices (evergreen browsers, WebGL support, ES2020+). However, it must include graceful fallback for older devices with browsers or OS that do not support all features (e.g., WebGL absence, older Safari iOS, Chrome <90). The fallback must degrade 3D animations (Three.js, motion libraries), avoid unavailable APIs, and keep core functions usable (login, menu, orders, reservations). Detection follows the pattern already implemented in `Pages/Landing.vue::supportsWebGL`.

## Architecture
Monorepo with six parts:
- **`strapi/`** — Strapi v5 headless CMS (backend + admin panel). Serves REST API on `http://localhost:1337`. Supports MySQL (default), SQLite, and Postgres (configurable via env vars in `strapi/config/database.js`). Hosts all authenticated endpoints and internal services.
- **`vuejs/frontend/`** — Vue 3 + Vite SPA. Consumes Strapi REST API. Uses Bootstrap 5 for styling, Vuex for auth state, Vue Router with role-based auth guards. Supports single-user (owner) and multi-staff (gestione, cameriere, cucina, bar, pizzeria, cucina_sg) modes.
- **`ocr-service/`** — Python 3.10+ / FastAPI microservice bound to `127.0.0.1:8001`. Proprietary OCR pipeline: converts PDFs/images of restaurant menus to structured JSON using PyMuPDF (rasterization), OpenCV (deskew/denoise/CLAHE), PaddleOCR (text extraction + coordinates), and local Ollama LLM (JSON structuring). Invoked exclusively by Strapi for menu import; never exposed publicly.
- **`pos-rt-service/`** — Runtime POS daemon (Node.js) for Windows/Linux/macOS + mobile Capacitor companion app (Vue 3 + TypeScript). Manages local POS hardware (payment terminals, receipt printers, fiscal registers), queues jobs from Strapi, and dispatches via WebSocket or HTTP polling. Includes multi-platform installers (MSI/DMG/DEB) and generic device drivers (jPOS, ESCPOS, ECR).
- **`test-site/`** — Standalone HTML/JS test site. Demonstrates how external websites consume the public menu API. No authentication required.
- **`restaurant-sites/`** — Runtime directory served in production. Contains `<username>.html` for each restaurant (generated externally by the owner, not source code). Strapi provides a placeholder on restaurant creation.

### Internal Communication
- Frontend ↔ Strapi: `fetch()` over HTTP to `http://localhost:1337/api/...` using Strapi v5 query syntax (via `qs` library for filters/populate).
- Strapi ↔ OCR service: HTTP `POST /process` (multipart file upload), authenticated with optional `X-Internal-Token`.
- Strapi ↔ POS-RT service: HTTP `GET /api/pos-devices/me/jobs` (polling) or WebSocket `/ws/pos` (push, auth via `Authorization: Bearer <device_token>`).
- Strapi ↔ Supabase Realtime: WebSocket for live order/reservation updates (optional, configurable).
## Strapi Content Types (API models)
Core business models:
- **Menu** (`api::menu.menu`) — links a user (`fk_user`, oneToOne) to many Elements (`fk_elements`, oneToMany). Represents the restaurant's digital menu.
- **Element** (`api::element.element`) — menu item: `name`, `price`, `category`, `image` (media), `ingredients` (JSON), `allergens` (JSON). Snapshot at order item creation for traceability.
- **WebsiteConfig** (`api::website-config.website-config`) — restaurant website metadata: `site_url`, `restaurant_name`, `logo` (media), `coperti_invernali` (required, integer ≥1, table capacity for winter), `coperti_estivi` (optional, defaults to `coperti_invernali` on write, summer capacity), `fk_user` (oneToOne). Used by Reservations API for capacity checks.
- **Table** (`api::table.table`) — restaurant table: `number` (integer, unique per user), `seats` (integer, 1..100), `area` (enum: interno|esterno, default interno), `status` (enum: free|occupied|reserved, denormalized — updated atomically on order open/close), `fk_user` (manyToOne). Uniqueness `(number, fk_user)` enforced at controller level.
- **Reservation** (`api::reservation.reservation`) — table booking: `customer_name`, `phone`, `customer_email`, `date` (YYYY-MM-DD), `time` (HH:mm:ss), `datetime` (computed, ISO datetime for queries), `slot_start` (datetime, rounded to 30min bucket for conflict detection), `number_of_people` (1..1000), `notes` (optional), `is_walkin` (boolean, default false — walk-ins bypass reservation flow), `status` (enum: pending|confirmed|at_restaurant|completed|cancelled, default pending), `fk_user` (manyToOne), `fk_table` (manyToOne, optional — assigned during seating), `fk_order` (oneToOne, optional — linked when order opens). State machine enforced; pending/cancelled do NOT consume capacity. Capacity check via transactional lock (ADR-0001).
- **Order** (`api::order.order`) — dine-in or takeaway order: `status` (enum: active|closed), `service_type` (enum: table|takeaway, default table), `takeaway_status` (enum: pending_acceptance|confirmed|sent_to_departments|ready|picked_up|closed, only for service_type=takeaway), `customer_name`, `customer_phone`, `customer_email`, `pickup_at` (datetime, takeaway pickup time), `sent_to_departments_at`, `ready_at`, `picked_up_at` (timestamps for takeaway workflow), `opened_at` (datetime), `closed_at` (datetime, nullable), `total_amount` (decimal, server-derived), `payment_status` (enum: unpaid|paid), `payment_reference` (string, nullable, external payment system ID), `fiscal_status` (enum: pending|completed|failed|not_required), `fiscal_receipt_id`, `fiscal_event_id` (fiscal register integration fields), `lock_version` (integer, optimistic locking), `covers` (integer, optional, number of covers), `fk_table` (manyToOne to Table, null for takeaway), `fk_user` (manyToOne), `fk_items` (oneToMany to OrderItem), `fk_reservation` (oneToOne, optional — linked reservation if exists). Invariant: one active order per table per user at a time (for dine-in).
- **OrderItem** (`api::order-item.order-item`) — order line item: `name` (string snapshot), `price` (decimal snapshot), `quantity` (integer, min 1), `category` (string, optional), `course` (integer, 1..12, optional — course/portata number for kitchen routing), `notes` (optional), `status` (enum: taken|preparing|ready|served, default taken), `fk_order` (manyToOne, inversedBy fk_items), `fk_element` (manyToOne to Element, optional, for menu traceability).

Internal/stats models:
- **MenuElementStat** (`api::menu-element-stat.menu-element-stat`) — counter per Element: lifetime orders count, last ordered timestamp. Internal only (routes: []). Updated via `services/stats.js`.
- **RestaurantDailyStat** (`api::restaurant-daily-stat.restaurant-daily-stat`) — daily aggregate per user: `date`, `revenue`, `customers_count`, `orders_count`, `walkin_count`, `reservation_count`, `takeaway_count`, `items_sold`. Internal only (routes: []). Computed via `services/stats.js`.
- **OrderArchive** (`api::order-archive.order-archive`) — immutable snapshot of closed order for audit/analytics: `date`, `items_json`, `customer_*`, `total_amount`, `payment_*`, `fiscal_*`, `table_number`, `service_type`, `covers`. Internal only (routes: []). Written on order close via `services/order-close-finalizer.js`.

POS integration models:
- **PosDevice** (`api::pos-device.pos-device`) — registered POS terminal: `device_token_hash` (SHA256, server-side), `device_name`, `device_model`, `os_type` (Linux|Windows|macOS), `last_heartbeat` (datetime), `config_json` (hardware driver settings), `fk_user` (manyToOne). Pairing via `pos-pairing-token`.
- **PosJob** (`api::pos-job.pos-job`) — async job queue for pos-rt-service: `kind` (enum: order.close|print.receipt|payment.charge|payment.refund), `status` (enum: pending|dispatched|acked_success|acked_failure|cancelled), `priority` (integer), `event_id` (idempotency key), `payload` (JSON request), `outcome` (JSON response, nullable), `created_at`, `acked_at`. Internal only (routes: []). Consumed via `GET /api/pos-devices/me/jobs` polling or `/ws/pos` push.
- **PosPairingToken** (`api::pos-pairing-token.pos-pairing-token`) — single-use token for device pairing: `token_hash` (SHA256), `expires_at` (datetime, TTL 15min), `fk_user` (manyToOne), `consumed_at` (datetime, nullable). Consumed on `POST /api/pos-devices/register-by-token`.

Deprecated:
- **Preference** (`api::preference.preference`) — DEPRECATED, kept for backward compatibility. Was: theme colors (primary_color, second_color, background, details, theme name). Ready to drop; column `up_users.fk_prefs` still exists.
## Public API
- **`GET /api/menus/public/:userDocumentId`** — Fetch complete menu for a restaurant. No auth. Response: `{ data: { restaurant_name, logo_url, categories[], elements[] } }`. Each element includes name, price, category, ingredients, allergens, image URLs.
- **`POST /api/reservations/public/:userDocumentId`** — Create table reservation from external website. No auth. Rate-limited (5 req / 10 min / IP). Body: `{ customer_name, phone, date (YYYY-MM-DD), time (HH:mm:ss), number_of_people (1..1000), notes? }`. Coerces status to `pending` (pending does NOT consume capacity). Error codes: `RESTAURANT_NOT_FOUND` (404), `INVALID_PAYLOAD` (400).
- **`GET /api/takeaways/public/:userDocumentId`** — Fetch active takeaway orders for a restaurant. No auth. Response: list of orders with `service_type=takeaway` and `status` in [confirmed, sent_to_departments, ready]. Used by external kiosk displays.
- **`POST /api/takeaways/public/:userDocumentId`** — Create takeaway order from external website. No auth. Body: `{ customer_name, phone, email?, items: { name, price, quantity }[], pickup_at, notes? }`. Returns 201 with order data. Error codes: `RESTAURANT_NOT_FOUND` (404), `INVALID_PAYLOAD` (400), `INVALID_PICKUP_TIME` (422).
## Menu Import (OCR) API
Authenticated endpoints that drive the PDF/image → JSON pipeline. Both live in `strapi/src/api/menu/controllers/menu.js` and `routes/custom-menu.js`.
- **`POST /api/menus/import/analyze`** — multipart `file` (PDF/PNG/JPG/JPEG/WEBP, max 20 MB). Strapi validates MIME + magic bytes, saves the file under `MENU_UPLOAD_DIR/<restaurant-slug>/<ts>_<rand>.<ext>`, then calls the OCR microservice (`POST /process`). Returns `{ data: { elements, count, ocr_confidence, warnings, source_file } }`. Each element is annotated with `_missing` flags so the UI can highlight fields to complete. Error codes: `LLM_UNAVAILABLE` (503), `OCR_UNAVAILABLE` (503), `OCR_TIMEOUT` (504), `OCR_INVALID_RESULT` (422).
- **`POST /api/menus/import/bulk`** — JSON `{ mode: "append"|"replace", elements: [...] }`. Validates every element upfront; wraps create + (optional) delete in a Knex transaction scoped to the logged-in user's menu. `replace` atomically swaps the elements and then deletes the old ones. Hard cap at 200 elements/request.
## Reservations API
Authenticated endpoints for table bookings. Live in `strapi/src/api/reservation/controllers/reservation.js` and `routes/custom-reservation.js`. Full design in `docs/adr/0001-reservations-system.md`.
- **`POST /api/reservations`** (authenticated) — Create a reservation from the restaurant dashboard. Body: `{ customer_name, phone, date (YYYY-MM-DD), time (HH:mm[:ss]), number_of_people (1..1000), notes?, status? ("pending"|"confirmed", default "confirmed") }`. Runs transactional capacity check (`SELECT ... FOR UPDATE`). Returns 201 with `{ data: { documentId, slot_start, status, ... } }`. Error codes: `INVALID_PAYLOAD` (400), `CAPACITY_NOT_CONFIGURED` (409), `OVERBOOKING` (409, includes capacity/current/requested/slot_start), `RESERVATION_CONTENTION` (503 after 3 retries).
- **`POST /api/reservations/walkin`** (authenticated) — Create a walk-in (no-reservation) event. Body: `{ customer_name, phone?, number_of_people (1..1000), notes? }`. Sets `is_walkin=true`, status=pending. Instant (no capacity check). Returns 201.
- **`POST /api/reservations/:documentId/seat`** (authenticated) — Seat a reservation at a table. Body: `{ table_id (documentId) }`. Assigns `fk_table` and advances status via FSM if needed (pending→confirmed if table assigned). Returns 200. Error codes: `TABLE_NOT_FOUND` (404), `NOT_OWNER` (403).
- **`GET /api/reservations`** (authenticated) — Paginated list of user's reservations. Query: `status` (CSV), `from`, `to` (ISO datetime), `page`, `pageSize` (default 1/25, cap 100). Response: `{ data: [...], meta: { pagination } }`. Sorted by `datetime:asc`. Scoped to logged-in user.
- **`PATCH /api/reservations/:documentId/status`** (authenticated) — Advance reservation via state machine. Body: `{ status }`. Guards: ownership, FSM validation, found. Capacity re-check on promotion to occupying status. Returns 200. Error codes: `NOT_OWNER` (403), `INVALID_TRANSITION` (400), `RESERVATION_NOT_FOUND` (404).
**State machine:** pending → confirmed|cancelled; confirmed → at_restaurant|cancelled; at_restaurant → completed. Capacity counts: confirmed + at_restaurant. Pending/cancelled do NOT consume. Terminals: completed, cancelled.
**Concurrency:** `strapi.db.transaction` + `FOR UPDATE` row lock (PostgreSQL) or `BEGIN IMMEDIATE` (SQLite). Retry 3× with 50/150/450ms ± 25% jitter backoff (see `strapi/src/utils/db-lock.js`).
## Orders & Tables API
Authenticated endpoints for table and order management. Live in `strapi/src/api/table/controllers/table.js`, `strapi/src/api/order/controllers/order.js` and `routes/custom-*.js`. Full design in `docs/adr/0002-orders-system.md` and takeaway design in `docs/adr/0005-takeaway-orders.md`.
### Tables
- **`GET /api/tables`** (authenticated) — List all tables. Response: `{ data: [...], meta: { total } }`.
- **`POST /api/tables`** (authenticated) — Create table. Body: `{ number, seats, area? }`. Uniqueness `(number, fk_user)` enforced in transaction. Error codes: `TABLE_ALREADY_EXISTS` (409), `INVALID_PAYLOAD` (400). Response 201.
- **`PATCH /api/tables/:documentId`** (authenticated) — Update table. Body: `{ number?, seats?, area? }`. Blocked if `status=occupied` (409 `TABLE_ALREADY_OCCUPIED`).
- **`DELETE /api/tables/:documentId`** (authenticated) — Delete table. Blocked if occupied. Response 204.
### Orders (Dine-in)
- **`POST /api/orders`** (authenticated) — Open order on table. Body: `{ table_id (documentId), service_type: "table", covers? }`. Transactional check: no active order on table. Sets `table.status='occupied'`. Returns 201 with order. Error codes: `TABLE_NOT_FOUND` (404), `TABLE_ALREADY_OCCUPIED` (409), `ORDER_CONTENTION` (503), `NOT_OWNER` (403), `INVALID_PAYLOAD` (400).
- **`POST /api/takeaways`** (authenticated) — Open takeaway order. Body: `{ service_type: "takeaway", customer_name, customer_phone?, customer_email?, pickup_at (datetime), items: { name, price, quantity }[] }`. Returns 201. Sets `takeaway_status=pending_acceptance`.
- **`GET /api/orders`** (authenticated) — Paginated list. Query: `status` (active,closed), `service_type` (table,takeaway), `table` (documentId), `from`, `to` (ISO datetime), `page`, `pageSize` (default 1/25, cap 100). Sorted `opened_at:desc`. Response: `{ data: [...], meta: { pagination } }`.
- **`GET /api/orders/:documentId`** (authenticated) — Single order with items, table, reservation. Error codes: `ORDER_NOT_FOUND` (404), `NOT_OWNER` (403).
- **`POST /api/orders/:documentId/items`** (authenticated) — Add item. Two modes: from menu `{ element_id, quantity, notes?, lock_version? }` (server snapshots name/price/category); free-form `{ name, price, quantity, category?, course?, notes?, lock_version? }`. Recalculates total, increments `lock_version`. For dine-in orders with category_routing enabled (plan="pro"), routes item to correct department via `course` or category match. Response 201: `{ data: { item, order: { total_amount, lock_version } } }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId`** (authenticated) — Update item quantity/notes/course. Only if `item.status=taken` and `order.status=active`. Body: `{ quantity?, notes?, course?, lock_version? }`. Error codes: `ITEM_NOT_EDITABLE` (409), `STALE_ORDER` (409).
- **`DELETE /api/orders/:documentId/items/:itemDocumentId`** (authenticated) — Delete item. Same guards as update. Body: `{ lock_version? }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId/status`** (authenticated) — Advance item FSM. Body: `{ status }`. No `lock_version` needed (FSM unidirectional: taken→preparing→ready→served). Error codes: `INVALID_ITEM_TRANSITION` (400), `ORDER_NOT_ACTIVE` (409).
- **`POST /api/orders/:documentId/close`** (authenticated) — Close order + payment. Body: `{ payment_method?: "simulator"|"pos"|"fiscal_register", lock_version? }`. Invokes payment service via strategy pattern. On success: closes order, updates fiscal fields, queues PosJob for fiscal register, sets `table.status='free'` (dine-in only). Creates OrderArchive snapshot. Response 200 with closed order. Error codes: `ORDER_NOT_ACTIVE` (409), `STALE_ORDER` (409), `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503), `ORDER_CONTENTION` (503), `FISCAL_REGISTER_ERROR` (500 if fiscal job queuing fails).
### Takeaway workflow
- **`PATCH /api/takeaways/:documentId/accept`** (authenticated) — Accept pending takeaway order. Sets `takeaway_status=confirmed`. Returns 200.
- **`PATCH /api/takeaways/:documentId/reject`** (authenticated) — Reject pending takeaway order. Sets `takeaway_status=closed`, `status=closed`. Returns 200.
- **`PATCH /api/takeaways/:documentId/send`** (authenticated) — Send order to departments (kitchen/bar/etc via category_routing). Sets `takeaway_status=sent_to_departments`, `sent_to_departments_at=now`. Returns 200.
- **`PATCH /api/takeaways/:documentId/ready`** (authenticated) — Mark all items ready for pickup. Sets `takeaway_status=ready`, `ready_at=now`. Returns 200.
- **`PATCH /api/takeaways/:documentId/pickup`** (authenticated) — Customer picks up order. Sets `takeaway_status=picked_up`, `picked_up_at=now`, `status=closed`, `payment_status=paid`. Returns 200.

**Item FSM:** taken → preparing → ready → served. No backward transitions. Editable (qty/notes/course) only when status=taken.
**Order FSM:** active → closed (dine-in); takeaway has its own FSM above.
**Optimistic locking:** Client sends `lock_version` for mutations. Server rejects 409 `STALE_ORDER` on mismatch. Incremented on every mutation.
**Concurrency:** `strapi.db.transaction` + `FOR UPDATE` (PostgreSQL) / `BEGIN IMMEDIATE` (SQLite). Retry 3× with 50/150/450ms ± 25% jitter (see `strapi/src/utils/db-lock.js`). Final error: 503 `ORDER_CONTENTION`.
**Category routing:** Only if plan="pro". Maps `order_item.course` or `element.category` to staff role (CUCINA/BAR/PIZZERIA/CUCINA_SG). Planned feature v2; starter plan forces everything to CUCINA.
## Payment Service (design)
Strategy pattern at `strapi/src/services/payment/`. Factory in `index.js` selects strategy by `payment_method` param or `PAYMENT_STRATEGY` env var (default: `simulator`).
**Strategies:**
- `simulator` (`strategies/simulator.js`) — local simulation. Configurable latency (`PAYMENT_SIMULATOR_LATENCY_MS`, default 200ms) and failure rate (`PAYMENT_SIMULATOR_FAILURE_RATE`, default 0 = never fails). Returns `{ success, transactionId: "SIM-<uuid>", timestamp, amount, currency }`.
- `pos` (`strategies/pos.js`) — Routes to pos-rt-service via PosJob queue. Creates job with kind=payment.charge, waits for acked_success/acked_failure. Returns `{ success, transactionId, timestamp }` or throws. Stub for v2 SumUp/Nexi.
- `fiscal_register` (`strategies/fiscal-register.js`) — Routes to fiscal register via pos-rt-service (same PosJob pattern). Stub for v2 RT integration.
**Env vars:** `PAYMENT_STRATEGY`, `PAYMENT_SIMULATOR_LATENCY_MS`, `PAYMENT_SIMULATOR_FAILURE_RATE`.
**Error codes:** `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503).

## Account & Billing API
Authenticated endpoints for subscription and restaurant configuration. Live in `strapi/src/api/account/controllers/account.js` and `strapi/src/api/billing/controllers/billing.js`.
### Account endpoints
- **`GET /api/account/profile`** (authenticated) — User profile: name, email, restaurant_name, subscription status, staff list.
- **`PATCH /api/account/password`** (authenticated) — Change password. Body: `{ old_password, new_password }`. Returns 200.
- **`POST /api/account/2fa/enable`** (authenticated) — Enable 2FA via email. Returns 200 with qr_code (for future TOTP). Sends email code.
- **`POST /api/account/2fa/confirm`** (authenticated) — Confirm 2FA with email code. Body: `{ code }`. Returns 200.
- **`POST /api/account/2fa/disable`** (authenticated) — Disable 2FA. Body: `{ password }`. Returns 200.
- **`POST /api/account/2fa/recovery`** (authenticated) — Generate 2FA recovery codes. Returns 200 with codes list (encrypted).
- **`DELETE /api/account/destroy`** (authenticated) — Delete account and all related data. Body: `{ password, confirmation: "DELETE" }`. Returns 204 (async purge).
- **`GET /api/account/website-config`** (authenticated) — Restaurant config: site_url, restaurant_name, logo, coperti_invernali/estivi. Alias for WebsiteConfig read.
- **`POST /api/account/staff`** (authenticated) — Invite staff member. Body: `{ email, role (owner|gestione|cameriere|cucina|bar|pizzeria|cucina_sg) }`. Sends invite email. Returns 201.
- **`GET /api/account/staff`** (authenticated) — List staff members. Returns array of staff with roles.
- **`DELETE /api/account/staff/:staffUserId`** (authenticated) — Revoke staff member. Owner only. Returns 204.
- **`GET /api/account/category-routing`** (authenticated) — Fetch category→department mapping (pro plan only). Returns `{ categories: { name: role } }`.
- **`PUT /api/account/category-routing`** (authenticated) — Update category routing (pro plan only). Body: `{ categories: { name: role } }`. Returns 200.

### Billing endpoints
- **`GET /api/billing/status`** (authenticated) — Subscription status. Returns `{ plan, status (active|trialing|past_due|cancelled), current_period_start, current_period_end, items [] }`.
- **`POST /api/billing/checkout`** (authenticated) — Initiate Stripe checkout. Body: `{ plan_id }`. Returns `{ sessionId, url }`. Redirects to Stripe.
- **`POST /api/billing/sync-checkout`** (authenticated) — Sync Stripe webhook (server-initiated). Body: `{ event_id }`. Returns 200 if webhook already processed, else syncs.
- **`POST /api/billing/portal`** (authenticated) — Get Stripe customer portal link. Returns `{ url }`.
- **`POST /api/billing/change-plan`** (authenticated) — Change subscription plan. Body: `{ plan_id }`. Cancels current subscription, creates new one. Returns 200 with new status.
- **`POST /api/billing/cancel`** (authenticated) — Cancel subscription. Returns 200 with cancellation date.
- **`POST /api/billing/reactivate`** (authenticated) — Reactivate cancelled subscription. Returns 200 with new status.
- **`POST /api/billing/webhook`** (public, Stripe-signed) — Handle Stripe webhook events. Processes charge.succeeded, customer.subscription.updated, customer.subscription.deleted events. Returns 200 (webhook signature verified server-side).

## Ingredients API
- **`GET /api/ingredients`** (authenticated) — List all ingredients. Response: array of `{ id, name, allergens (JSON) }`.
- **`PUT /api/ingredients/toggle`** (authenticated) — Toggle ingredient availability. Body: `{ ingredient_id, available (boolean) }`. Returns 200.

## POS Devices API
Authenticated endpoints for hardware pairing and job dispatch. Live in `strapi/src/api/pos-device/controllers/pos-device.js` and `routes/custom-pos-device.js`.
### Pairing
- **`POST /api/pos-devices/register`** (authenticated) — Start device registration. Returns `{ pairing_token, expires_at }` (15min TTL). Use this token on the device to call register-by-token.
- **`POST /api/pos-devices/register-by-token`** (authenticated via X-Device-Token header on first call, then uses returned device_token) — Complete device registration. Body: `{ pairing_token, device_name, device_model, os_type }`. Consumes pairing token, creates PosDevice record, returns `{ device_token }` (store this securely on device). Returns 201.
- **`POST /api/pos-devices/revoke`** (authenticated) — Revoke device. Body: `{ device_id }`. Deletes PosDevice, invalidates token. Returns 204.

### Job dispatch (pos-rt-service runtime API)
- **`GET /api/pos-devices/me/jobs`** (authenticated via X-Device-Token header) — Poll for pending jobs. Response: `{ data: [ { id, kind, priority, payload, event_id }, ... ] }`. Jobs in pending state; device should ack them.
- **`POST /api/pos-devices/me/ack-job`** (authenticated via X-Device-Token) — Acknowledge job result. Body: `{ job_id, status (acked_success|acked_failure), outcome (JSON) }`. Returns 200. Sets `PosJob.status`, `acked_at`, `outcome`.
- **`POST /api/pos-devices/me/heartbeat`** (authenticated via X-Device-Token) — Heartbeat. Body: `{ timestamp }`. Updates `PosDevice.last_heartbeat`. Returns 200.
- **`POST /api/pos-devices/me/config`** (authenticated via X-Device-Token) — Get device config. Returns `{ config_json, supported_payment_methods, supported_printers }` from PosDevice record.
- **`POST /api/pos-devices/me/push-token`** (authenticated via X-Device-Token) — Register Firebase/APNs push token for async notifications. Body: `{ push_token, platform (fcm|apns) }`. Returns 200.

### WebSocket (pos-rt-service runtime)
- **`/ws/pos`** (WebSocket, authenticated via `Authorization: Bearer <device_token>`) — Bidirectional real-time channel. Server pushes PosJobs to device; device sends acks. Fallback to `/api/pos-devices/me/jobs` polling if WebSocket unavailable.

### Admin endpoints
- **`GET /api/pos-devices/installers`** (public) — List available installers (Windows MSI, macOS DMG, Linux DEB). Response: `[ { os, version, download_url, checksum } ]`.
- **`GET /api/pos-devices/downloads/:osType/:version/:filename`** (public, rate-limited) — Download installer. Streaming download with checksum validation.
## Frontend Structure
Location: `vuejs/frontend/src/`

### Pages (route-level views)
- **Auth pages:**
  - `Auth/Login.vue` — login form, JWT storage via Vuex.
  - `Auth/Register.vue` — registration form: email, password, coperti_invernali (required, 1..10000), coperti_estivi (optional, defaults to coperti_invernali). Redirects to `/choose-plan` on success.
  - `Auth/ForgotPassword.vue` — password reset request (email-based).
  - `Auth/ResetPassword.vue` — password reset form (via token).
  - `Auth/Logout.vue` — logout trigger (clears Vuex + localStorage).
  - `Auth/VerifyEmail.vue` — NOT ROUTATED (in waiting, requires SMTP). Email verification flow.
  - `Auth/TwoFactorChallenge.vue` — NOT ROUTATED (in waiting, requires SMTP). 2FA code entry.
- **Billing:**
  - `ChoosePlan.vue` — plan selection (starter, pro), redirects to Stripe checkout.
  - `RenewSub.vue` — subscription renewal link (Stripe portal).
  - `AddPayment.vue` — payment method addition (Stripe).
- **Public:**
  - `Landing.vue` — public landing page with 3D hero scene (Three.js). Fallback detection via `supportsWebGL()` for older browsers. Marketing copy.
  - `TermsOfService.vue` — static terms.
  - `PrivacyPolicy.vue` — static privacy policy.
  - `WhoAreUs.vue` — static about page.
  - `ContactUs.vue` — contact form (email submission).
- **Dashboard & Configuration:**
  - `Dashboard.vue` — manager dashboard (stats, orders/reservations count, revenue, quick actions). Auth-required, requires active subscription. Roles: owner, gestione.
  - `MenuSetter.vue` — menu CRUD (add/edit/delete elements, bulk import via OCR). Mounts `MenuImporter.vue` permanently so tab switches don't lose OCR state. Roles: owner, gestione.
  - `WebsiteConfig.vue` — restaurant config: site_url, restaurant_name, logo upload, coperti_invernali/estivi edit, QR code generation. Under `/profile/show` routing. Roles: owner, gestione.
  - `Profile/Show.vue` — user profile: email, password, 2FA status, staff list, subscription info. Includes `/site-config` nested route. Roles: owner, gestione.
- **Operational pages:**
  - `Reservations.vue` — table reservation management. Desktop: 3-column kanban (Requests / Confirmed / Occupied). Mobile: tab-switched view. Polling 20s (paused when tab hidden). Create/edit/seat/status-change modals. Roles: owner, gestione, cameriere.
  - `Orders.vue` — multi-mode order & takeaway management. Single component with `meta.ordersMode` determining UI layout:
    - `orders_mode=cameriere` → Table grid (all tables with status), order detail modal. Roles: owner, gestione, cameriere.
    - `orders_mode=cucina` → 3-column kanban (Da fare / In preparazione / Pronti), each item card with timer. Roles: owner, gestione, cucina.
    - `orders_mode=bar`, `pizzeria`, `cucina_sg` → Same kanban, filtered by department (category_routing). Roles: owner, gestione, + specific department role.
    - Polling 20s (paused when tab hidden). Optimistic UI with lock_version handling and STALE_ORDER recovery. Item status FSM advance via swipe/click. Add item modal (menu or free-form), checkout modal (payment method selection).

### Layouts
- `AppLayout.vue` — main app shell. Top navbar with logo, user menu, theme toggle. Sidebar (desktop) / bottom nav (mobile) with routing links. Badge counts for pending reservations and active orders (polled 30s). Responsive design (Bootstrap 5 grid).
- `MobileBottomNav.vue` — mobile-only bottom navigation bar (5-6 main routes: Home, Menu, Reservations, Orders, Profile).
- `MobileTopBar.vue` — mobile-only top bar (back button, title, user menu).

### Components (reusable UI)
- **Menu components:**
  - `MenuAdder.vue` — form to add/edit single element (name, price, category, allergens, ingredients, image upload).
  - `MenuList.vue` — paginated list of menu elements with inline edit/delete.
  - `MenuImporter.vue` — OCR upload flow (file picker → POST /analyze → review modal with confidence badges → mode choice append/replace → confirm destructive → POST /bulk). Error handling for OCR_UNAVAILABLE / LLM_UNAVAILABLE / timeouts.
  - `IngredientsManager.vue` — toggle ingredient availability.
- **Reservation components:**
  - `ReservationCard.vue` — single reservation card (name, time, covers, status badge, actions).
  - `ReservationColumn.vue` — kanban column (title, list of cards, drag-drop between columns).
  - `ReservationCreateModal.vue` — form to create reservation (customer_name, phone, date, time, covers, notes, initial status).
  - `ReservationStatusBadge.vue` — colored badge (pending→orange, confirmed→green, at_restaurant→blue, completed→gray, cancelled→red).
  - `SeatReservationModal.vue` — assign reservation to table, advance status to confirmed.
  - `WalkinModal.vue` — create walk-in (no-reservation) event.
- **Order components (waiter/cameriere mode):**
  - `OrdersTableGrid.vue` — grid of tables (each cell: table number, covers, status badge, click for detail modal).
  - `OrdersTableCard.vue` — single table card with ready-items pulse animation, occupancy status.
  - `OccupiedOrderCard.vue` — compact order card (items count, total, time open).
  - `OrderDetailModal.vue` — full order detail: items list with qty/notes, add item button, checkout button. Handles lock_version collisions with re-fetch prompt.
  - `OrderItemRow.vue` — single item row: name, qty +/- buttons, delete button, course tag, notes. Actions disabled if status≠taken.
  - `AddItemModal.vue` — two tabs: from-menu (autocomplete + qty) or free-form (name, price, qty).
  - `CheckoutModal.vue` — payment breakdown (subtotal, tax, discount, total), payment method selector (simulator, pos, fiscal_register), confirm button.
  - `TableManagerModal.vue` — CRUD for table setup (create, edit number/seats/area, delete if not occupied).
- **Order components (kitchen/cucina mode):**
  - `KitchenBoard.vue` — 3-column kanban (Da fare / In preparazione / Pronti). Drag-drop between columns (or button-click for accessibility).
  - `KitchenItemCard.vue` — item card with course number, item name, notes, timer (minutes since taken), FSM advance buttons (preparing → ready). Color-coded by department.
- **Shared components:**
  - `Modal.vue` — modal dialog wrapper (header, body, footer slots, backdrop click to close, ESC key).
  - `GeneratorQRCode.vue` — QR code display (uses qrcode.vue library, accepts restaurant_id + baseUrl).
  - `OrderStatusBadge.vue` — colored status badge (taken→blue, preparing→yellow, ready→green, served→gray).
  - `SalaAreaSummary.vue` — area-wise table count summary (interno/esterno).
  - `SalaFiltersBar.vue` — filter bar (area, status filters, search by customer).
  - `TakeawayOrderCard.vue` — takeaway order card (customer_name, pickup_time, status badge, accept/reject/send/ready/pickup actions).
  - `TakeawayCreateModal.vue` — form to create takeaway order.
  - `TakeawayEditModal.vue` — form to edit pending takeaway.
  - `ThemeToggle.vue` — light/dark theme switcher (stores in localStorage).
  - `LandingHeroScene.vue` — 3D hero scene wrapper (Three.js, with WebGL fallback to static image).
  - Form inputs: `TextInput.vue`, `InputLabel.vue`, `InputError.vue`, `Checkbox.vue`, etc.
  - Deprecated/deleted: `Footer.vue`, `DangerButton.vue`, `SectionBorder.vue`, `SectionTitle.vue`, `Checkbox.vue` (old), `icons/` folder, `ConfirmPassword.vue`, `DialogModal.vue`, `PrimaryButton.vue`, `SecondaryButton.vue`, `MenuViewComponent.vue`, `MenuView.vue`, `MenuLayout.vue`, `PrefsSetter.vue`.

### Store & Utils
- **`store.js`** — Vuex store: `state = { user, token }`, getters `isAuthenticated`, `getUser`, mutations `setUser`, `setToken`, `logout`. JWT + user persisted in localStorage.
- **`staffAccess.js`** — staff role system: `STAFF_ROLES = { owner, gestione, cameriere, cucina, bar, pizzeria, cucina_sg }`. Function `canAccessRoute(route, user)` checks `route.meta.staffRoles`. Function `defaultRouteForUser(user)` returns home route by role. Used by router guard.
- **`supabase.js`** — Supabase realtime client initialization. Flag `isSupabaseRealtimeConfigured` (env-based). Used by `AppLayout.vue` for navbar badge counts and `Orders.vue` for live updates.
- **`utils.js`** — API helper functions (all HTTP `fetch()` to `http://localhost:1337/api/...`):
  - Menu: `fetchMenuElements`, `importMenuAnalyze` (multipart POST), `importMenuBulk` (POST).
  - Reservations: `fetchReservations`, `createReservation`, `updateReservationStatus`, `createWalkin`, `seatReservation`, `reservationErrorMessage`.
  - Tables: `fetchTables`, `createTable`, `updateTable`, `deleteTable`.
  - Orders (dine-in): `fetchOrders`, `fetchOrder`, `openOrder`, `closeOrder`, `addOrderItem`, `updateOrderItem`, `deleteOrderItem`, `updateItemStatus`, `orderErrorMessage`.
  - Orders (takeaway): `createTakeaway`, `acceptTakeaway`, `rejectTakeaway`, `sendTakeaway`, `readyTakeaway`, `pickupTakeaway`, `editTakeaway`.
  - Account: `fetchBillingStatus`, `initiateCheckout`, `fetchStaff`, `inviteStaff`, `revokeStaff`, `fetchCategoryRouting`, `updateCategoryRouting`, `fetchAccountProfile`, `changePassword`, `enable2FA`, `confirm2FA`, `disable2FA`, `generateRecoveryCodes`, `deleteAccount`.
  - Ingredients: `fetchIngredients`, `toggleIngredient`.
  - Exports: `API_BASE` constant, error message helpers.
  - **Dead code (not imported anywhere):** `fetchPublicMenu`, `fetchOrderTotal`, `isSubscriptionRequiredError`.

### Router
- **`router/index.js`** — Vue Router with `createRouter(createWebHistory)`. All routes defined as dynamic imports. Guards:
  - `meta.requiresAuth` — checks `store.getters.isAuthenticated`, redirects to `/login` if not.
  - `meta.requiresSubscription` — checks billing status via `fetchBillingStatus()` with 5s timeout. Redirects to `/renew-sub` if not active. Uses `withTimeout()` helper.
  - `meta.staffRoles` — checks `store.getters.getUser.role` against allowed roles. Redirects to default route for user role if not allowed.
  - Smart redirect on `/` and `/home`: to `/dashboard` if authenticated, else `/landing`.
  
### Routing table (all routes from `router/index.js`)
| Route | Auth | Subscription | Staff roles | Component | Description |
|-------|------|--------------|-------------|-----------|-------------|
| `/landing` | No | No | — | Landing | Public landing page |
| `/login` | No | No | — | Login | Login form |
| `/register` | No | No | — | Register | Registration form |
| `/choose-plan` | No | No | — | ChoosePlan | Plan selection → Stripe checkout |
| `/forgot-password` | No | No | — | ForgotPassword | Password reset request |
| `/reset-password` | No | No | — | ResetPassword | Password reset form |
| `/terms` | No | No | — | TermsOfService | Static terms |
| `/privacy-policy` | No | No | — | PrivacyPolicy | Static privacy policy |
| `/who-are-us` | No | No | — | WhoAreUs | Static about page |
| `/contact-us` | No | No | — | ContactUs | Contact form |
| `/logout` | Yes | No | — | Logout | Logout trigger |
| `/dashboard` | Yes | Yes | owner, gestione | Dashboard | Manager dashboard (stats) |
| `/menu-handler` | Yes | Yes | owner, gestione | MenuSetter | Menu CRUD + OCR import |
| `/profile/show` | Yes | Yes | owner, gestione | Profile/Show | User profile + website config nested |
| `/site-config` | (nested) | Yes | owner, gestione | WebsiteConfig | Website configuration (nested in /profile/show) |
| `/reservations` | Yes | Yes | owner, gestione, cameriere | Reservations | Reservation management (kanban/tabs) |
| `/orders` | Yes | Yes | owner, gestione, cameriere | Orders (mode: cameriere) | Order management (waiter view, table grid) |
| `/kitchen` | Yes | Yes | owner, gestione, cucina | Orders (mode: cucina) | Kitchen board (3-column kanban) |
| `/bar` | Yes | Yes | owner, gestione, bar | Orders (mode: bar) | Bar board (3-column kanban, filtered) |
| `/pizzeria` | Yes | Yes | owner, gestione, pizzeria | Orders (mode: pizzeria) | Pizzeria board (3-column kanban, filtered) |
| `/kitchen-sg` | Yes | Yes | owner, gestione, cucina, cucina_sg | Orders (mode: cucina_sg) | Gluten-free kitchen board |
| `/renew-sub` | Yes | No | — | RenewSub | Subscription renewal (Stripe portal) |
| `/add-payment` | Yes | No | — | AddPayment | Payment method addition |
| `/` | — | — | — | (redirect) | Smart redirect to /dashboard or /landing |
| `/home` | — | — | — | (redirect) | Smart redirect to /dashboard or /landing |

### Dead pages (not routated)
- `Auth/VerifyEmail.vue` — in waiting, requires SMTP + email verification.
- `Auth/TwoFactorChallenge.vue` — in waiting, requires SMTP + email code/recovery codes.
## POS-RT Service
Location: `pos-rt-service/`

### Daemon (Node.js runtime)
Located in `src/`. Runs on restaurant's Windows/Linux/macOS PC. Core responsibilities:
- **Hardware communication:** Drivers for payment terminals (jPOS, generic ECR), receipt printers (ESCPOS, Epson FP-Mate), fiscal registers (ESCPOS-fiscal). Registry in `src/drivers/registry.js`.
- **Job dispatch:** Polls `GET /api/pos-devices/me/jobs` (Strapi) or receives WebSocket push `/ws/pos`. Processes job kinds: order.close (charge payment), print.receipt (thermal printer), payment.charge (terminal), payment.refund, etc.
- **Configuration:** Reads `src/drivers/registry.json` for device model → driver mapping. Device config (hardware params) stored in `PosDevice.config_json` on Strapi.
- **Crash recovery:** Persistent job queue (SQLite), re-fetch on restart.
- **Env vars:** `STRAPI_URL`, `DEVICE_TOKEN`, `WEBSOCKET_ENABLED`, `JOB_POLL_INTERVAL_MS` (default 5s), device-specific vars (port, model, etc.).

### Mobile app (Capacitor + Vue 3)
Located in `mobile/`. Companion app for staff pairing and discovery on mobile devices.
- **Platforms:** Android (native plugins in `mobile/android-plugins/`), iOS (staging in `mobile/ios-staging/`, in waiting for Apple Developer account).
- **Features:** QR code scanner for device pairing, local WiFi discovery, push notifications (Firebase Cloud Messaging / APNs), remote configuration sync.
- **Tech:** Vue 3 + TypeScript + Capacitor for cross-platform bridge.

### Installers (multi-platform)
Located in `installer/`. Generates platform-specific installers:
- **Linux:** DEB package via dpkg-buildpackage.
- **macOS:** DMG via create-dmg.
- **Windows:** MSI via WiX toolset (`installer/windows/wix/`).
- Build process: `npm run build:installers` (see `installer/Makefile`).

### ADRs
- `docs/adr/0003-pos-rt-service.md` — Complete design: hardware architecture, job queue, driver registry, error handling, concurrency.
- `docs/adr/0004-mobile-discovery-and-real-drivers.md` — Mobile app discovery flow and driver selection strategy.

## OCR Service
Location: `ocr-service/`. Python 3.10+ FastAPI microservice bound to `127.0.0.1:8001` (loopback only).

### Modules
- `app/api/` — endpoints: `GET /health` (ping), `POST /process` (multipart file upload → structured JSON).
- `app/preprocessing/` — PDF → images via PyMuPDF, cleanup (grayscale, binarization, threshold).
- `app/layout/` — image detector (finds text regions), noise filter, document reconstruction.
- `app/ocr/` — PaddleOCR runner (singleton pattern to avoid reload overhead), menu parser (aggregates OCR boxes into elements by spatial proximity).
- `app/ollama/` — Ollama client (HTTP POST to local LLM), prompt engineering for JSON structuring.
- `app/utils/` — logging, path security (prevents directory traversal), error handling.
- `tests/` — unit tests: `test_menu_parser.py`, `test_pdf_text_extraction.py`.

### Workflow
1. Receive multipart file (PDF/PNG/JPG/JPEG/WEBP, max 20 MB).
2. Validate MIME + magic bytes.
3. PDF → images (PyMuPDF, 300 DPI).
4. Preprocessing: deskew, denoise, CLAHE, binarization.
5. PaddleOCR: extract text boxes with coordinates.
6. Layout detection: group boxes by spatial proximity → candidate elements.
7. Ollama LLM: restructure + validate JSON schema. Outputs per-element `_missing` flags.
8. Response: `{ elements: [...], count, ocr_confidence (0..1), warnings: [...], source_file }`.

### Error codes (HTTP)
- `200 OK` — success.
- `400 Bad Request` — invalid MIME, file too large, unsupported format.
- `422 Unprocessable Entity` — OCR result invalid schema.
- `503 Service Unavailable` — LLM or OCR unavailable.
- `504 Gateway Timeout` — processing timeout (configurable, default 60s).

### Env vars
See `ocr-service/.env.example`:
- `ALLOWED_INPUT_DIR` — path to Strapi `MENU_UPLOAD_DIR` (path security check).
- `OLLAMA_URL` — local Ollama endpoint (default `http://127.0.0.1:11434`).
- `OLLAMA_MODEL` — model name (default `llama2-uncensored`).
- `PROCESSING_TIMEOUT_SECONDS` — max processing time (default 60s).
- `LOG_LEVEL` — logging level (default `INFO`).

### Startup
```bash
cd ocr-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/warmup.py  # (optional) pre-download PaddleOCR weights
uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Requires running Ollama: `ollama serve` + `ollama pull <model>`.

### Artifacts to clean
- `ocr-service/app/api/vecchio.py.txt` — backup of old process.py, can be deleted.
- `ocr-service/ocr-test.{err,out}.log` — temp logs, can be deleted.

## Database Migrations & SQL Patches
### JavaScript migrations (`strapi/database/migrations/`)
Idempotent, auto-run by Strapi on `npm run dev`:
- `001_operational_indexes.js` — creates indexes on frequently queried columns (order.opened_at, reservation.datetime, etc.).
- `002_order_item_course_fields.js` — adds `order_item.category` and `order_item.course` fields (integer 1..12).
- `003_takeaway_fields.js` — adds Order fields for takeaway workflow (service_type, takeaway_status, customer_*, pickup_at, sent_to_departments_at, ready_at, picked_up_at).

### SQL patches (`docs/sql/`)
Manual application required BEFORE first Strapi startup on fresh Postgres:
1. **`restaurant_staff.sql`** — creates table `restaurant_staff (id, owner_id, staff_user_id, role)` for staff access control.
2. **`category_routing_schema.sql`** — creates `restaurant_category_routing (id, restaurant_id, element_category, target_role)` and related triggers.
3. **`category_routing_functions.sql`** — creates PG functions for category → role lookup.
4. **`realtime_relation_link_patch.sql`** — Supabase realtime: enables updates on Orders table (for live order badges in navbar). Alternative: `realtime_relation_link_patch_no_dollar.sql` (same content, no $1 syntax, for older PG versions).
5. (Deprecated/redundant) `order_item_course_fields.sql`, `takeaway_fields.sql` — duplicates of JS migrations, applied manually at early stage, can be skipped.

**Note:** Files `realtime_relation_link_patch.sql` and `realtime_relation_link_patch_no_dollar.sql` are functionally identical; the second is a workaround for PG versions that don't support `$1` syntax (obsolete, use first).

### Installation order (fresh Postgres)
1. Apply `restaurant_staff.sql`.
2. Apply `category_routing_schema.sql` + `category_routing_functions.sql`.
3. Apply `realtime_relation_link_patch.sql` (if using Supabase realtime).
4. Start Strapi (`npm run dev`) — JS migrations auto-run.

## Development Commands
### Backend (Strapi)
```bash
cd strapi
npm install
npm run dev        # start with auto-reload, runs migrations
npm run build      # build admin panel
npm run start      # start without auto-reload (production)
npm run seed       # (if available) seed sample data
```
### Frontend (Vue)
```bash
cd vuejs/frontend
npm install
npm run dev        # Vite dev server (port 5174) with HMR
npm run build      # production build
npm run preview    # preview production build locally
npm run lint       # (if configured) lint check
```
### OCR microservice (Python)
```bash
cd ocr-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/warmup.py  # (optional) pre-download weights
uvicorn app.main:app --host 127.0.0.1 --port 8001
```
### POS-RT Service (Node.js daemon)
```bash
cd pos-rt-service
npm install
npm run dev        # start with auto-reload (uses nodemon)
npm run build      # build TypeScript
npm run start      # production start
npm run build:installers  # generate platform-specific installers (Linux/macOS/Windows)
```
### POS Mobile App (Capacitor)
```bash
cd pos-rt-service/mobile
npm install
npm run build      # build Vue + generate Capacitor dist
npx cap open ios   # open Xcode for iOS development (requires macOS)
npx cap open android  # open Android Studio for Android development
npx cap build ios / npx cap build android  # platform-specific build
```
### Test Site
```bash
cd test-site
# Open index.html in browser, or serve with:
python3 -m http.server 8080
# Visit http://localhost:8080?restaurant=<USER_DOCUMENT_ID>
```

### Full local stack startup
Terminal 1: `cd strapi && npm run dev` (port 1337)
Terminal 2: `cd vuejs/frontend && npm run dev` (port 5174)
Terminal 3: `cd ocr-service && uvicorn app.main:app --host 127.0.0.1 --port 8001`
Terminal 4 (optional): `cd pos-rt-service && npm run dev` (port 3000 or configured)
Terminal 5 (optional): `ollama serve` (required for OCR LLM)
Then open http://localhost:5174 in browser.

### Production builds
- **Strapi:** `cd strapi && npm run build && npm run start`
- **Frontend:** `cd vuejs/frontend && npm run build`, serve dist/ via static server or CDN.
- **OCR:** Docker recommended (see `ocr-service/Dockerfile`).
- **POS-RT:** Run installer on restaurant PC (see `pos-rt-service/installer/`).

## Architectural Decision Records (ADRs)
- **`docs/adr/0001-reservations-system.md`** — Reservation capacity model, state machine, concurrency (row-level lock + retry), API contract.
- **`docs/adr/0002-orders-system.md`** — Order/OrderItem FSM, optimistic locking (lock_version), payment service strategy, concurrency.
- **`docs/adr/0003-pos-rt-service.md`** — POS daemon architecture, hardware drivers, job queue, device pairing.
- **`docs/adr/0004-mobile-discovery-and-real-drivers.md`** — Mobile app discovery (QR + WiFi), driver selection strategy.
- **`docs/adr/0005-takeaway-orders.md`** — Takeaway order FSM, customer workflow, category_routing integration.

## Known Tech Debt
### Committed artifacts (build output)
- **`strapi/.strapi/client/`** — Strapi admin panel build output (should be in `.gitignore`, generated by `npm run build`).
- **`strapi/types/generated/`** — auto-generated TypeScript types (should be in `.gitignore`).
- **`kitchen-overlay.png`** (root) — temporary screenshot/overlay file.
- **`test-screens/`, `test-screenshots/`** — temporary test screenshots directory.
- **`ocr-service/ocr-test.{err,out}.log`** — temporary test logs.
- **`ocr-service/app/api/vecchio.py.txt`** — backup of old process.py implementation, can be deleted.
- **Recommended action:** Add above paths to `.gitignore` (except vecchio.py.txt which can be deleted immediately).

### Root `package.json`
- **Issue:** Monorepo root has duplicate dependency declarations vs. sub-projects (strapi, vuejs/frontend, pos-rt-service). No npm workspaces defined.
- **Recommendation:** Either convert to npm workspaces (v8+) or document as intentional (independent sub-projects with separate node_modules).

### Deprecated Strapi models
- **`Preference`** (`api::preference.preference`) — DEPRECATED, used for theme colors. Column `up_users.fk_prefs` still exists.
- **Recommendation:** Drop table + column in next migration (backward compatible: no active code uses it).

### Frontend dead exports in `utils.js`
- **Not imported anywhere:**
  - `fetchPublicMenu` — public menu API is used by test-site, but not imported from main frontend.
  - `fetchOrderTotal` — total is computed on server (order.total_amount), client never uses this.
  - `isSubscriptionRequiredError` — subscription check now integrated into router guard.
- **Recommendation:** Audit for actual usage, then remove if truly dead.

### Frontend component dead code
- **Not routated (in waiting):**
  - `Pages/Auth/VerifyEmail.vue` — requires SMTP server for email confirmation.
  - `Pages/Auth/TwoFactorChallenge.vue` — requires SMTP server for 2FA email codes + recovery codes.
- **Deleted in recent cleanup:** PrefsSetter, MenuView, MenuLayout, MenuViewComponent, Footer, DangerButton, SectionBorder, SectionTitle, Checkbox (old), icons folder, ConfirmPassword flow (Jetstream-style).
- **Recommendation:** Activate email verification once SMTP is reliable (recommended service: Sendgrid, Brevo, or self-hosted Mailgun).

### Profile/Show.vue unused props
- **Props declared but never passed from router:**
  - `confirmsTwoFactorAuthentication`
  - `sessions`
- **Status:** Residue from Jetstream template, likely dead code.
- **Recommendation:** Clean up when 2FA is activated.

### Duplicate SQL migrations
- **`docs/sql/order_item_course_fields.sql`** and **`docs/sql/takeaway_fields.sql`** — duplicates of JS migrations. Applied manually at early development stage, then JS migrations added later.
- **Recommendation:** Remove SQL versions, rely on JS migrations only. Keep JS migrations as source of truth.

### Redundant realtime SQL
- **`docs/sql/realtime_relation_link_patch.sql`** and **`realtime_relation_link_patch_no_dollar.sql`** — functionally identical. Second is workaround for old PG versions.
- **Recommendation:** Keep first, delete second.

### Staff access & category routing (v2 features)
- **`staffAccess.js`** — STAFF_ROLES and role-based routing fully integrated.
- **`category_routing_*.sql`** — category → department mapping functional but plan-gated (only pro plan).
- **Starter plan:** Forces all items to CUCINA (no routing logic).
- **Recommendation:** Starter → pro migration should activate routing dynamically.

### Mobile app (Capacitor)
- **iOS:** Staging in `mobile/ios-staging/`, in waiting for Apple Developer account. Build process not fully tested.
- **Recommendation:** Complete iOS setup once account provisioned. Test on real device (simulator may not support all plugins).

### OCR warmup script
- **`ocr-service/scripts/warmup.py`** — pre-downloads PaddleOCR weights (multi-GB). Useful for CI/CD but slows local first-run.
- **Recommendation:** Document as optional, skip in dev unless first-run is critical.

## MCP Tools: code-review-graph
**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.
### When to use graph tools FIRST
- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`
Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.
### Key Tools
| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |
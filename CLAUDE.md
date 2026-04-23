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
CMS for restaurant menu management. Restaurant owners register, build their digital menu, configure their external website integration, and generate a QR code. The system exposes a public API that external websites can consume to display the menu. The project is in Italian (UI labels, route names, comments).
## Architecture
Monorepo with four parts:
- **`strapi/`** — Strapi v5 headless CMS (backend + admin panel). Serves REST API on `http://localhost:1337`. Uses MySQL by default (configurable via env vars in `strapi/config/database.js`, also supports SQLite and Postgres).
- **`vuejs/frontend/`** — Vue 3 + Vite SPA. Consumes Strapi API. Uses Bootstrap 5 for styling, Vuex for state, Vue Router with auth guards.
- **`ocr-service/`** — Python 3.10+ / FastAPI microservice bound to `127.0.0.1:8001`. Proprietary pipeline that converts PDFs/images of restaurant menus to structured JSON using PyMuPDF (rasterization), OpenCV (deskew/denoise/CLAHE), PaddleOCR (text + coordinates), and a local Ollama LLM (structuring). Invoked exclusively by Strapi; never exposed publicly.
- **`test-site/`** — Standalone HTML/JS test site that consumes the public menu API. Demonstrates how external websites integrate with the CMS.
The frontend talks to Strapi exclusively via `fetch()` calls to `http://localhost:1337/api/...` using Strapi v5 query syntax (via `qs` library for filters/populate). Strapi talks to the OCR microservice over HTTP (`OCR_SERVICE_URL`), optionally authenticated with a shared `X-Internal-Token`.
## Strapi Content Types (API models)
- **Menu** (`api::menu.menu`) — links a user (`fk_user`, oneToOne) to many Elements (`fk_elements`, oneToMany)
- **Element** (`api::element.element`) — a menu item: name, price, category, image, ingredients (JSON), allergens (JSON)
- **WebsiteConfig** (`api::website-config.website-config`) — restaurant website configuration: site_url, restaurant_name, logo (media), `coperti_invernali` (required, integer ≥1), `coperti_estivi` (optional, defaults to `coperti_invernali` on write), fk_user (oneToOne)
- **Reservation** (`api::reservation.reservation`) — table booking: `customer_name`, `phone`, `date` (YYYY-MM-DD), `time` (HH:mm:ss), `datetime` (combined, used for queries), `slot_start` (bucket for conflict check), `number_of_people` (1..1000), `notes` (text, optional), `status` (enum: pending|confirmed|at_restaurant|completed|cancelled), `fk_user` (manyToOne). State machine enforced (see Reservations API below). Capacity check via transactional lock on WebsiteConfig.
- **Table** (`api::table.table`) — restaurant table: `number` (integer, required, unique per user), `seats` (integer, 1..100), `area` (enum: interno|esterno, default interno), `status` (enum: free|occupied|reserved, default free, denormalized -- updated atomically on order open/close), `fk_user` (manyToOne). Uniqueness constraint `(number, fk_user)` enforced at application level in controller.
- **Order** (`api::order.order`) — in-room order: `status` (enum: active|closed), `opened_at` (datetime), `closed_at` (datetime, nullable), `total_amount` (decimal, server-derived), `payment_status` (enum: unpaid|paid), `payment_reference` (string, nullable), `lock_version` (integer, optimistic locking), `covers` (integer, optional), `fk_table` (manyToOne to Table), `fk_user` (manyToOne), `fk_items` (oneToMany to OrderItem). Invariant: one active order per table per user at a time.
- **OrderItem** (`api::order-item.order-item`) — order line item: `name` (string, snapshot at insertion), `price` (decimal, snapshot), `quantity` (integer, min 1), `notes` (text, optional), `status` (enum: taken|preparing|ready|served), `fk_order` (manyToOne to Order, inversedBy fk_items), `fk_element` (manyToOne to Element, optional reference for traceability).
- **Preference** (`api::preference.preference`) — DEPRECATED, kept for backward compatibility. Was: theme colors (primary_color, second_color, background, details, theme name)
## Public API
- **`GET /api/menus/public/:userDocumentId`** — Returns the complete menu for a restaurant. No authentication required. Response includes: restaurant_name, logo_url, categories[], elements[] (each with name, price, category, ingredients, allergens, image URLs).
- **`POST /api/reservations/public/:userDocumentId`** — Create a table reservation from the public website. No authentication required. Rate-limited (5 req / 10 min / IP). Body: flat payload `{ customer_name, phone, date, time, number_of_people, notes? }`. Coerces status to `pending` (pending does NOT consume capacity — no overbooking check on this endpoint). Error codes: `RESTAURANT_NOT_FOUND` (404), `INVALID_PAYLOAD` (400).
## Menu Import (OCR) API
Authenticated endpoints that drive the PDF/image → JSON pipeline. Both live in `strapi/src/api/menu/controllers/menu.js` and `routes/custom-menu.js`.
- **`POST /api/menus/import/analyze`** — multipart `file` (PDF/PNG/JPG/JPEG/WEBP, max 20 MB). Strapi validates MIME + magic bytes, saves the file under `MENU_UPLOAD_DIR/<restaurant-slug>/<ts>_<rand>.<ext>`, then calls the OCR microservice (`POST /process`). Returns `{ data: { elements, count, ocr_confidence, warnings, source_file } }`. Each element is annotated with `_missing` flags so the UI can highlight fields to complete. Error codes: `LLM_UNAVAILABLE` (503), `OCR_UNAVAILABLE` (503), `OCR_TIMEOUT` (504), `OCR_INVALID_RESULT` (422).
- **`POST /api/menus/import/bulk`** — JSON `{ mode: "append"|"replace", elements: [...] }`. Validates every element upfront; wraps create + (optional) delete in a Knex transaction scoped to the logged-in user's menu. `replace` atomically swaps the elements and then deletes the old ones. Hard cap at 200 elements/request.
## Reservations API
Authenticated endpoints for table bookings. Live in `strapi/src/api/reservation/controllers/reservation.js` and `routes/custom-reservation.js`. Full design in `docs/adr/0001-reservations-system.md`.
- **`POST /api/reservations`** (authenticated) — Create a reservation from the restaurant dashboard. Body: flat payload `{ customer_name, phone, date (YYYY-MM-DD), time (HH:mm[:ss]), number_of_people (1..1000), notes?, status? ("pending"|"confirmed", default "confirmed") }`. Runs capacity check in a transactional lock (Knex `SELECT ... FOR UPDATE`). Returns 201 with the created reservation doc (includes `documentId`, `slot_start`). Error codes: `INVALID_PAYLOAD` (400), `CAPACITY_NOT_CONFIGURED` (409), `OVERBOOKING` (409, with details: capacity, current, requested, slot_start), `RESERVATION_CONTENTION` (503 after 3 retry attempts with exponential backoff).
- **`GET /api/reservations`** (authenticated) — Paginated list of the user's reservations. Query params: `status` (CSV), `from`, `to` (ISO datetime), `page`, `pageSize` (default 1/25, cap 100). Response sorted by `datetime:asc`. Returns `{ data: [...], meta: { pagination: {...} } }`. Scoped to logged-in user.
- **`PATCH /api/reservations/:documentId/status`** (authenticated) — Change reservation status via state machine (pending→confirmed|cancelled, confirmed→at_restaurant|cancelled, at_restaurant→completed). Body: `{ status }`. Guards: ownership check (403 `NOT_OWNER`), FSM validation (400 `INVALID_TRANSITION`), reservation found (404 `RESERVATION_NOT_FOUND`). Returns 200 with updated object. Capacity re-check happens when promoting to an occupying status.
**State machine:** `pending → confirmed|cancelled`, `confirmed → at_restaurant|cancelled`, `at_restaurant → completed`. Capacity counts: `confirmed`, `at_restaurant` only. `pending` and `cancelled` do NOT consume capacity. Terminals: `completed`, `cancelled`. See ADR-0001 for details.
**Concurrency:** Every create/update that affects capacity uses `strapi.db.transaction` with row-level lock (`FOR UPDATE` on website_configs + reservations matching the slot). SQLite uses `BEGIN IMMEDIATE` for DB-wide lock. Deadlock detected and retried 3× with 50ms/150ms/450ms backoff ± 25% jitter.
## Orders & Tables API
Authenticated endpoints for table and order management. Live in `strapi/src/api/table/controllers/table.js`, `strapi/src/api/order/controllers/order.js` and corresponding `routes/custom-*.js`. Full design in `docs/adr/0002-orders-system.md`.
### Tables
- **`GET /api/tables`** (authenticated) — List all tables for the logged-in user. Response: `{ data: [...], meta: { total } }`.
- **`POST /api/tables`** (authenticated) — Create a table. Body: `{ number, seats, area? }`. Uniqueness `(number, fk_user)` checked in transaction. Error codes: `TABLE_ALREADY_EXISTS` (409), `INVALID_PAYLOAD` (400). Response 201.
- **`PATCH /api/tables/:documentId`** (authenticated) — Update a table. Body: `{ number?, seats?, area? }`. Blocked if `status=occupied` (`TABLE_ALREADY_OCCUPIED` 409).
- **`DELETE /api/tables/:documentId`** (authenticated) — Delete a table. Blocked if occupied. Response 204.
### Orders
- **`POST /api/orders`** (authenticated) — Open an order on a table. Body: `{ table_id (documentId), covers? }`. Transaction + check no active order on that table. Sets `table.status = 'occupied'`. Error codes: `TABLE_NOT_FOUND` (404), `TABLE_ALREADY_OCCUPIED` (409), `ORDER_CONTENTION` (503), `NOT_OWNER` (403), `INVALID_PAYLOAD` (400). Response 201.
- **`GET /api/orders`** (authenticated) — Paginated list. Query: `status` (CSV: active,closed), `table` (documentId), `from`, `to` (ISO datetime), `page`, `pageSize` (default 1/25, cap 100). Sorted `opened_at:desc`. Returns `{ data: [...], meta: { pagination } }`.
- **`GET /api/orders/:documentId`** (authenticated) — Single order with populated items and table. Error codes: `ORDER_NOT_FOUND` (404), `NOT_OWNER` (403).
- **`GET /api/orders/:documentId/total`** (authenticated) — Real-time derived total. Returns `{ data: { subtotal, tax, discount, total } }`. v1: tax=0, discount=0, so total=subtotal.
- **`POST /api/orders/:documentId/items`** (authenticated) — Add item. Two modes: from menu `{ element_id, quantity, notes?, lock_version? }` (server snapshots name/price from Element); free `{ name, price, quantity, notes?, lock_version? }`. Recalculates total, increments `lock_version`. Response 201: `{ data: { item, order: { total_amount, lock_version } } }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId`** (authenticated) — Update quantity/notes. Only if `item.status === 'taken'` and `order.status === 'active'`. Body: `{ quantity?, notes?, lock_version? }`. Error codes: `ITEM_NOT_EDITABLE` (409), `STALE_ORDER` (409).
- **`DELETE /api/orders/:documentId/items/:itemDocumentId`** (authenticated) — Delete item. Same guards as update. Body: `{ lock_version? }`.
- **`PATCH /api/orders/:documentId/items/:itemDocumentId/status`** (authenticated) — Advance item FSM. Body: `{ status }`. No `lock_version` required (FSM is unidirectional). Error codes: `INVALID_ITEM_TRANSITION` (400), `ORDER_NOT_ACTIVE` (409).
- **`POST /api/orders/:documentId/close`** (authenticated) — Close order + payment. Body: `{ payment_method?: "simulator"|"pos"|"fiscal_register", lock_version? }`. Default: "simulator". Invokes payment service, if OK: closes order, sets `table.status = 'free'`. Error codes: `ORDER_NOT_ACTIVE` (409), `STALE_ORDER` (409), `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503), `ORDER_CONTENTION` (503).
**Item state machine:** `taken → preparing → ready → served`. No backward/lateral transitions. Modification (quantity/notes) and deletion only when `status === 'taken'`.
**Order state machine:** `active → closed`. Closure requires successful payment.
**Optimistic locking:** Client sends `lock_version` in body for mutations (add/update/delete item, close). Server rejects with 409 `STALE_ORDER` if mismatch; client must re-fetch and retry. Incremented on every mutation.
**Concurrency:** Same pattern as reservations (ADR-0001). `strapi.db.transaction` + `SELECT ... FOR UPDATE` on orders/tables rows. SQLite: `BEGIN IMMEDIATE`. Retry via `withRetry` from `strapi/src/utils/db-lock.js` (3 attempts, 50/150/450ms + 25% jitter). Final error: 503 `ORDER_CONTENTION`.
## Payment Service (design)
Strategy pattern implementation at `strapi/src/services/payment/`. Factory in `index.js` selects strategy by `payment_method` param or `PAYMENT_STRATEGY` env var (default: `simulator`).
**Strategies:**
- `simulator` (`strategies/simulator.js`) — local simulation. Configurable latency (`PAYMENT_SIMULATOR_LATENCY_MS`, default 200ms) and failure rate (`PAYMENT_SIMULATOR_FAILURE_RATE`, default 0 = never fails). Returns `{ success, transactionId: "SIM-<uuid>", timestamp, amount, currency }`.
- `pos` (`strategies/pos.js`) — POS terminal stub. Throws `NotImplementedError` (reserved for v2 SumUp/Nexi integration).
- `fiscal_register` (`strategies/fiscal-register.js`) — fiscal register stub. Throws `NotImplementedError` (reserved for v2 RT integration).
**Env vars:** `PAYMENT_STRATEGY`, `PAYMENT_SIMULATOR_LATENCY_MS`, `PAYMENT_SIMULATOR_FAILURE_RATE` (see `strapi/.env.example`).
**Error codes:** `PAYMENT_DECLINED` (402), `PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503).
## Frontend Structure
- `Pages/` — route-level views:
  - `Dashboard.vue` — landing page with stats (authenticated) or marketing (public)
  - `MenuSetter.vue` — menu management (add/edit/delete elements)
  - `Reservations.vue` — table reservation management (authenticated). Desktop: kanban 3-column layout (Requests / Confirmed / Occupied). Mobile: tabs. Polling 20s with pause when tab hidden.
  - `Orders.vue` — order management (authenticated). Toggle CAMERIERE/CUCINA (persisted in localStorage `orders_mode`). Cameriere: table grid with order detail modals. Cucina: 3-column kanban (Da fare / In preparazione / Pronti). Polling 20s with pause when tab hidden. Optimistic UI with lock_version handling and STALE_ORDER recovery.
  - `WebsiteConfig.vue` — website configuration (URL, restaurant name, logo, QR code, API info, capacity edits)
  - `Profile/` — user profile management
  - `Auth/` — Login, Register, Logout, ForgotPassword, etc. Register now accepts `coperti_invernali` (required, 1..10000) and `coperti_estivi` (optional, defaults to `coperti_invernali`).
- `Layouts/` — AppLayout (app shell with responsive navbar). Navbar includes "Prenotazioni" link (auth-only) with pending count badge and "Ordinazioni" link (auth-only) with active orders count badge (both polled 30s).
- `components/` — reusable UI:
  - Menu: MenuAdder, MenuList, MenuImporter, IngredientsManager. `MenuImporter.vue` owns the OCR upload flow: file picker → analyze → review modal → mode choice (append/replace) → destructive-confirm → bulk submit. Mounted permanently in `MenuSetter.vue` so tab switches don't lose state.
  - Reservations: ReservationCard, ReservationColumn, ReservationCreateModal, ReservationStatusBadge.
  - Orders: OrdersTableGrid (table grid for waiter mode), OrdersTableCard (single table card with ready-badge pulse), OrderDetailModal (order detail with item list, qty +/-, delete, serve actions), OrderItemRow (single item row with inline actions), AddItemModal (add from menu or free-form), CheckoutModal (payment breakdown + method selection), KitchenBoard (3-column kanban for kitchen), KitchenItemCard (kitchen item with timer and FSM advance), OrderStatusBadge (colored badge for item/order status), TableManagerModal (CRUD for table setup).
  - Shared: Modal, GeneratorQRCode, form inputs (TextInput, InputLabel, InputError, Checkbox).
- `store.js` — Vuex store for auth (user + JWT token in localStorage)
- `utils.js` — API functions: `fetchMenuElements`, `fetchPublicMenu`, `importMenuAnalyze`, `importMenuBulk`, `fetchReservations`, `createReservation`, `updateReservationStatus`, `reservationErrorMessage`, `fetchTables`, `createTable`, `updateTable`, `deleteTable`, `fetchOrders`, `fetchOrder`, `fetchOrderTotal`, `openOrder`, `closeOrder`, `addOrderItem`, `updateOrderItem`, `deleteOrderItem`, `updateItemStatus`, `orderErrorMessage`, and the `API_BASE` constant
- `router/index.js` — routes with `meta.requiresAuth` guard checking Vuex `isAuthenticated`
### Key Routes
| Route | Auth | Description |
|-------|------|-------------|
| `/`, `/home`, `/dashboard` | No | Dashboard |
| `/menu-handler` | Yes | Menu management |
| `/reservations` | Yes | Table reservation management |
| `/orders` | Yes | Order management (waiter + kitchen modes) |
| `/site-config` | Yes | Website configuration + QR code + capacity |
| `/profile/show` | Yes | User profile |
| `/login`, `/register` | No | Authentication |
## Development Commands
### Backend (Strapi)
```bash
cd strapi
npm install
npm run dev        # start with auto-reload (development)
npm run build      # build admin panel
npm run start      # start without auto-reload (production)
```
### Frontend (Vue)
```bash
cd vuejs/frontend
npm install
npm run dev        # Vite dev server with HMR
npm run build      # production build
npm run preview    # preview production build
```
### OCR microservice (Python)
```bash
cd ocr-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                          # set ALLOWED_INPUT_DIR = Strapi MENU_UPLOAD_DIR
python scripts/warmup.py                      # (optional) pre-download PaddleOCR weights
uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Requires a running Ollama (`ollama serve` + `ollama pull <model>`) reachable at `OLLAMA_URL`. The service is bound to loopback; Strapi is the only intended client. See `ocr-service/README.md` for full env matrix and troubleshooting.
### Test Site
```bash
# Open test-site/index.html in a browser, or serve with any static server:
cd test-site
python3 -m http.server 8080
# Then visit http://localhost:8080?restaurant=USER_DOCUMENT_ID
```
Both Strapi and Vite dev servers must run simultaneously during development. Strapi on port 1337, Vite dev server on port 5174. For the menu import flow, also start the OCR microservice on port 8001 and make sure Ollama is running locally.
## Architectural Decision Records (ADRs)
- **`docs/adr/0001-reservations-system.md`** — Complete design of the table reservation system: capacity model, state machine, concurrency strategy, API contract, schema, and migration notes. Refer to this for details beyond the summary in this file.
- **`docs/adr/0002-orders-system.md`** — Complete design of the orders system: Table/Order/OrderItem content types, item FSM (taken/preparing/ready/served), order FSM (active/closed), payment service strategy pattern, optimistic locking via `lock_version`, concurrency (same pattern as ADR-0001), API contract with all endpoints and error codes, frontend component plan.
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
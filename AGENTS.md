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
  1. *CONTEXT FRIENDLY*: Read the context from code-review-graph when possible or from AGENTS.md in the projects
  2. *PLAN FIRST*: Write plan to todo.md with checkable items
  3. *VERIFY PLAN*: Check in before starting implementation
  4. *TRACK PROGRESS*: Mark items complete as you go
  5. *EXPLAIN CHANGES*: High-level summary at each step
  6. *DOCUMENT RESULTS*: Add review section to todo.md
  7. *CAPTURE LESSONS*: Update lessons after corrections
## CORE PRINCIPLES
  - *Simplicity First*: Make every change as simple as possible. Impact minimal code.
  - *No laziness*: Find root causes. No temporary fixes. Senior developer standards
  - *Minimal Impact*: Only touch what's necessary. No side effects with new bugs

## Project Overview
Multi-feature restaurant management system. Owners register, build the digital menu, manage table reservations and dine-in/takeaway orders, configure their external website, and integrate with POS hardware. Public APIs expose menu and reservation flows for external sites. UI/labels/comments in Italian.

**Browser support:** modern evergreen + ES2020+ + WebGL. Must degrade gracefully on older Safari iOS / Chrome <90 / no-WebGL devices (fallback for Three.js, motion libs, missing APIs); all features must remain usable.

## Architecture (monorepo, 6 parts)
- **`strapi/`** — Strapi v5 CMS + admin. REST API on `http://localhost:1337`. Hosts auth + internal services. → `strapi/AGENTS.md`
- **`vuejs/frontend/`** — Vue 3 + Vite SPA. Bootstrap 5, Vuex, Vue Router with role-based guards. Single owner + multi-staff (gestione, cameriere, cucina, bar, pizzeria, cucina_sg). → `vuejs/frontend/AGENTS.md`
- **`ocr-service/`** — Python 3.10+ FastAPI on `127.0.0.1:8001`. PDF/image → JSON pipeline (PyMuPDF + OpenCV + PaddleOCR + local Ollama LLM). Called only by Strapi. → `ocr-service/AGENTS.md`
- **`pos-rt-service/`** — Node.js daemon (Win/Linux/macOS) + Capacitor mobile app. Drives POS terminals, printers, fiscal registers. → `pos-rt-service/AGENTS.md`
- **`restaurant-sites/`** — runtime dir with `<username>.html` per restaurant (owner-generated, not source).
- **`docs/adr/`** — architectural decision records (see ADR index below).

### Internal communication
- Frontend ↔ Strapi: `fetch()` to `http://localhost:1337/api/...` (Strapi v5 query syntax via `qs`).
- Strapi ↔ OCR: `POST /process` multipart, optional `X-Internal-Token`.
- Strapi ↔ POS-RT: `GET /api/pos-devices/me/jobs` polling or `/ws/pos` WS (`Authorization: Bearer <device_token>`).
- Strapi ↔ Supabase Realtime: WS for live order/reservation updates (optional).

### Where to look for details
- **Strapi content types, REST API, payment strategy, migrations** → `strapi/AGENTS.md`
- **Frontend pages/components/router/store/utils** → `vuejs/frontend/AGENTS.md`
- **OCR pipeline, env, startup** → `ocr-service/AGENTS.md`
- **POS-RT daemon, drivers, mobile app** → `pos-rt-service/AGENTS.md`

## Development Commands
- **Strapi:** `cd strapi && npm install && npm run dev` (auto-reload + migrations) / `npm run build` / `npm run start` / `npm run seed`.
- **Vue:** `cd vuejs/frontend && npm install && npm run dev` (Vite, port 5174 + HMR) / `npm run build` / `npm run preview` / `npm run lint`.
- **OCR:** see `ocr-service/AGENTS.md`.
- **POS-RT:** see `pos-rt-service/AGENTS.md`.

## ADRs
- `docs/adr/0001-reservations-system.md` — capacity, FSM, row-lock + retry, API.
- `docs/adr/0002-orders-system.md` — order/item FSM, optimistic locking, payment strategy, concurrency.
- `docs/adr/0003-pos-rt-service.md` — POS daemon arch, drivers, queue, pairing.
- `docs/adr/0004-mobile-discovery-and-real-drivers.md` — mobile discovery + driver selection.
- `docs/adr/0005-takeaway-orders.md` — takeaway FSM, customer flow, routing.

## Key Tools (code-review-graph)
| Tool | Use when |
|---|---|
| `detect_changes` | Reviewing changes — risk-scored analysis |
| `get_review_context` | Source snippets for review (token-efficient) |
| `get_impact_radius` | Blast radius of a change |
| `get_affected_flows` | Which execution paths are impacted |
| `query_graph` | Tracing callers/callees/imports/tests/deps |
| `semantic_search_nodes` | Find functions/classes by name/keyword |
| `get_architecture_overview` | High-level structure |
| `refactor_tool` | Plan renames, find dead code |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMS for restaurant menu management. Restaurant owners register, build their digital menu, configure their external website integration, and generate a QR code. The system exposes a public API that external websites can consume to display the menu. The project is in Italian (UI labels, route names, comments).

## Architecture

Monorepo with three parts:

- **`strapi/`** — Strapi v5 headless CMS (backend + admin panel). Serves REST API on `http://localhost:1337`. Uses MySQL by default (configurable via env vars in `strapi/config/database.js`, also supports SQLite and Postgres).
- **`vuejs/frontend/`** — Vue 3 + Vite SPA. Consumes Strapi API. Uses Bootstrap 5 for styling, Vuex for state, Vue Router with auth guards.
- **`test-site/`** — Standalone HTML/JS test site that consumes the public menu API. Demonstrates how external websites integrate with the CMS.

The frontend talks to Strapi exclusively via `fetch()` calls to `http://localhost:1337/api/...` using Strapi v5 query syntax (via `qs` library for filters/populate).

## Strapi Content Types (API models)

- **Menu** (`api::menu.menu`) — links a user (`fk_user`, oneToOne) to many Elements (`fk_elements`, oneToMany)
- **Element** (`api::element.element`) — a menu item: name, price, category, image, ingredients (JSON), allergens (JSON)
- **WebsiteConfig** (`api::website-config.website-config`) — restaurant website configuration: site_url, restaurant_name, logo (media), fk_user (oneToOne)
- **Preference** (`api::preference.preference`) — DEPRECATED, kept for backward compatibility. Was: theme colors (primary_color, second_color, background, details, theme name)

## Public API

- **`GET /api/menus/public/:userDocumentId`** — Returns the complete menu for a restaurant. No authentication required. Response includes: restaurant_name, logo_url, categories[], elements[] (each with name, price, category, ingredients, allergens, image URLs).

## Frontend Structure

- `Pages/` — route-level views:
  - `Dashboard.vue` — landing page with stats (authenticated) or marketing (public)
  - `MenuSetter.vue` — menu management (add/edit/delete elements)
  - `WebsiteConfig.vue` — website configuration (URL, restaurant name, logo, QR code, API info)
  - `Profile/` — user profile management
  - `Auth/` — Login, Register, Logout, ForgotPassword, etc.
- `Layouts/` — AppLayout (app shell with responsive navbar)
- `components/` — reusable UI (MenuAdder, MenuList, GeneratorQRCode, Modal, form inputs)
- `store.js` — Vuex store for auth (user + JWT token in localStorage)
- `utils.js` — `fetchMenuElements` and `fetchPublicMenu` API helpers, `API_BASE` constant
- `router/index.js` — routes with `meta.requiresAuth` guard checking Vuex `isAuthenticated`

### Key Routes

| Route | Auth | Description |
|-------|------|-------------|
| `/`, `/home`, `/dashboard` | No | Dashboard |
| `/menu-handler` | Yes | Menu management |
| `/site-config` | Yes | Website configuration + QR code |
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

### Test Site
```bash
# Open test-site/index.html in a browser, or serve with any static server:
cd test-site
python3 -m http.server 8080
# Then visit http://localhost:8080?restaurant=USER_DOCUMENT_ID
```

Both Strapi and Vite dev servers must run simultaneously during development. Strapi on port 1337, Vite dev server on port 5174.

## Seed Data

On first startup, Strapi bootstrap creates demo data automatically:
- **User:** `demo@restaurant.com` / `DemoPass123!`
- **Restaurant:** "Ristorante Demo" with 6 sample menu items (pizza, pasta, meat, salad, dessert, beverage)
- **WebsiteConfig:** linked to demo user

## Key Technical Details

- Strapi server binds to `0.0.0.0` (accessible on LAN for mobile testing)
- Auth flow: Strapi users-permissions plugin, JWT stored in localStorage and Vuex
- Registration creates a WebsiteConfig record automatically for each new user
- The public menu API (`/api/menus/public/:userDocumentId`) is defined as a custom route with `auth: false`
- Strapi v5 query format used throughout — `qs.stringify` with filters/populate objects
- Frontend uses Bootstrap 5 classes exclusively (no custom CSS framework)
- IMPORTANT: Component imports must use lowercase `@/components/` (not `@/Components/`) — Linux is case-sensitive

<!-- code-review-graph MCP tools -->
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

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

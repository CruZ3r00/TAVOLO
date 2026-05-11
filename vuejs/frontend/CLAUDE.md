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
## CORE PRINCIPLES
  - *Simplicity First*: Make every change as simple as possible. Impact minimal code.
  - *No laziness*: Find root causes. No temporary fixes. Senior developer standards
  - *Minimal Impact*: Only touch what's necessary. No side effects with new bugs

# Frontend (`vuejs/frontend/`)

Vue 3 + Vite SPA. Bootstrap 5, Vuex (auth), Vue Router with role-based guards. Single owner + multi-staff (gestione, cameriere, cucina, bar, pizzeria, cucina_sg). UI/labels/comments in Italian.

> Workflow / core principles vivono nel `CLAUDE.md` root del monorepo. Browser support (evergreen + ES2020+ + WebGL con fallback) idem.

Sorgenti in `src/`. API base `http://localhost:1337/api/...`.

## Pages
- **Auth:** `Login`, `Register` (email, password, coperti_invernali req 1..10000, coperti_estivi opt → /choose-plan), `ForgotPassword`, `ResetPassword`, `Logout`. **Not routed (waiting for SMTP):** `VerifyEmail`, `TwoFactorChallenge`.
- **Billing:** `ChoosePlan` (starter/pro → Stripe), `RenewSub` (Stripe portal), `AddPayment`.
- **Public:** `Landing` (3D hero via Three.js, `supportsWebGL()` fallback), `TermsOfService`, `PrivacyPolicy`, `WhoAreUs`, `ContactUs`.
- **Dashboard/Config:** `Dashboard` (stats, owner/gestione), `MenuSetter` (CRUD + persistent `MenuImporter` mount, owner/gestione), `WebsiteConfig` (nested in `/profile/show`), `Profile/Show` (email, password, 2FA, staff, sub).
- **Operational:**
  - `Reservations.vue` — desktop 3-col kanban (Requests/Confirmed/Occupied), mobile tabs. Polling 20s (paused when hidden). Roles: owner, gestione, cameriere.
  - `Orders.vue` — single component; `meta.ordersMode`:
    - `cameriere` → table grid + detail modal (owner, gestione, cameriere)
    - `cucina` → 3-col kanban with timer per item (owner, gestione, cucina)
    - `bar`/`pizzeria`/`cucina_sg` → same kanban, dept-filtered.
    Polling 20s (paused when hidden). Optimistic UI w/ `lock_version` + STALE_ORDER recovery. Item FSM via swipe/click. Add-item & checkout modals.

## Layouts
- `AppLayout.vue` — top navbar (logo, user menu, theme), desktop sidebar / mobile bottom nav, badge counts (pending reservations + active orders, polled 30s).
- `MobileBottomNav.vue` — Home/Menu/Reservations/Orders/Profile.
- `MobileTopBar.vue` — back, title, user menu.

## Components
- **Menu:** `MenuAdder`, `MenuList`, `MenuImporter` (file → analyze → review w/ confidence badges → append/replace → bulk; OCR/LLM/timeout error handling), `IngredientsManager`.
- **Reservation:** `ReservationCard`, `ReservationColumn`, `ReservationCreateModal`, `ReservationStatusBadge` (pending=orange, confirmed=green, at_restaurant=blue, completed=gray, cancelled=red), `SeatReservationModal`, `WalkinModal`.
- **Order (cameriere):** `OrdersTableGrid`, `OrdersTableCard` (pulse on ready items), `OccupiedOrderCard`, `OrderDetailModal` (handles lock_version collisions w/ refetch), `OrderItemRow` (qty +/-, delete, course tag, disabled if status≠taken), `AddItemModal` (menu/free-form tabs), `CheckoutModal` (subtotal/tax/discount/total + method), `TableManagerModal` (CRUD, no delete if occupied).
- **Order (cucina):** `KitchenBoard` (3-col kanban + drag-drop + button fallback), `KitchenItemCard` (course, name, notes, timer, FSM advance, color by dept).
- **Shared:** `Modal`, `GeneratorQRCode` (qrcode.vue + restaurant_id + baseUrl), `OrderStatusBadge` (taken=blue, preparing=yellow, ready=green, served=gray), `SalaAreaSummary`, `SalaFiltersBar`, `TakeawayOrderCard`, `TakeawayCreateModal`, `TakeawayEditModal`, `ThemeToggle` (localStorage), `LandingHeroScene` (Three.js + WebGL fallback). Form inputs: `TextInput`, `InputLabel`, `InputError`, etc.

## Store & Utils
- `store.js` — Vuex: `{ user, token }`; getters `isAuthenticated`, `getUser`; mutations `setUser`, `setToken`, `logout`. Persisted in localStorage.
- `staffAccess.js` — `STAFF_ROLES`, `canAccessRoute(route, user)` checks `route.meta.staffRoles`, `defaultRouteForUser(user)` → home by role.
- `supabase.js` — Realtime client + `isSupabaseRealtimeConfigured` flag. Used by `AppLayout` (badges) and `Orders.vue`.
- `utils.js` — API helpers (all `fetch` to `http://localhost:1337/api/...`):
  - Menu: `fetchMenuElements`, `importMenuAnalyze`, `importMenuBulk`.
  - Reservations: `fetchReservations`, `createReservation`, `updateReservationStatus`, `createWalkin`, `seatReservation`, `reservationErrorMessage`.
  - Tables: `fetchTables`, `createTable`, `updateTable`, `deleteTable`.
  - Orders dine-in: `fetchOrders`, `fetchOrder`, `openOrder`, `closeOrder`, `addOrderItem`, `updateOrderItem`, `deleteOrderItem`, `updateItemStatus`, `orderErrorMessage`.
  - Takeaway: `createTakeaway`, `acceptTakeaway`, `rejectTakeaway`, `sendTakeaway`, `readyTakeaway`, `pickupTakeaway`, `editTakeaway`.
  - Account/billing: `fetchBillingStatus`, `initiateCheckout`, `fetchStaff`, `inviteStaff`, `revokeStaff`, `fetchCategoryRouting`, `updateCategoryRouting`, `fetchAccountProfile`, `changePassword`, `enable2FA`, `confirm2FA`, `disable2FA`, `generateRecoveryCodes`, `deleteAccount`.
  - Ingredients: `fetchIngredients`, `toggleIngredient`.
  - Exports: `API_BASE`. Dead code: `fetchPublicMenu`, `fetchOrderTotal`, `isSubscriptionRequiredError`.

## Router (`router/index.js`)
Vue Router (`createWebHistory`), dynamic imports. Guards:
- `meta.requiresAuth` → `/login` if not authed.
- `meta.requiresSubscription` → checks `fetchBillingStatus()` (5s timeout via `withTimeout()`); not active → `/renew-sub`.
- `meta.staffRoles` → uses `staffAccess.js`; mismatched role → user's default route.
- `/` and `/home` → `/dashboard` (authed) or `/landing`.

## Routes
| Route | Auth | Sub | Roles | Component |
|---|---|---|---|---|
| `/landing`, `/login`, `/register`, `/choose-plan`, `/forgot-password`, `/reset-password`, `/terms`, `/privacy-policy`, `/who-are-us`, `/contact-us` | No | No | — | matching pages |
| `/logout` | Yes | No | — | Logout |
| `/dashboard`, `/menu-handler`, `/profile/show`, `/site-config` (nested) | Yes | Yes | owner, gestione | Dashboard / MenuSetter / Profile.Show / WebsiteConfig |
| `/reservations` | Yes | Yes | owner, gestione, cameriere | Reservations |
| `/orders` | Yes | Yes | owner, gestione, cameriere | Orders (cameriere) |
| `/kitchen` | Yes | Yes | owner, gestione, cucina | Orders (cucina) |
| `/bar` | Yes | Yes | owner, gestione, bar | Orders (bar) |
| `/pizzeria` | Yes | Yes | owner, gestione, pizzeria | Orders (pizzeria) |
| `/kitchen-sg` | Yes | Yes | owner, gestione, cucina, cucina_sg | Orders (cucina_sg) |
| `/renew-sub`, `/add-payment` | Yes | No | — | RenewSub / AddPayment |
| `/`, `/home` | — | — | — | smart redirect |

## Development Commands
- **Modern build (Vue 3, default):** `npm install && npm run dev` (Vite, port 5174 + HMR) / `npm run build:modern` / `npm run preview`.
- **Legacy build (Vue 2.7, browser molto vecchi):** `npm run dev:legacy` (port 5175) / `npm run build:legacy` / `npm run build:all` (entrambi).

## Dual-build (modern Vue 3 + legacy Vue 2.7)

Il frontend produce **due bundle paralleli** dallo stesso source dove possibile:

- **Modern**: Vue 3 SPA, target evergreen (ES2020+). Comportamento e UX invariati. Build via `vite.config.js` + entry `index.html` + `src/main.js`.
- **Legacy**: Vue 2.7 SPA per browser molto vecchi (Chrome 37+, Android 4.4+, IE11, SeaMonkey vecchi/Gecko 38+). Target ES5 via `@vitejs/plugin-legacy`. Build via `vite.config.legacy.mjs` + entry `index.legacy.html` + `src/main.legacy.js`.

**Perché Vue 2.7**: Vue 3 al runtime usa `Proxy`, non polyfillabile su browser senza supporto nativo. Vue 2.7 supporta Composition API + `<script setup>` (via `unplugin-vue2-script-setup`, **obbligatorio**: senza, `vite-plugin-vue2` usa `@vue/component-compiler-utils` che non risolve i binding di `<script setup>` nei template e i component reference diventano stringhe-tag rotte).

**`browserslist`** in `package.json`: `chrome >= 37, android >= 4.4, ios_saf >= 8, safari >= 8, firefox >= 38, ie >= 11, edge >= 12, samsung >= 4, opera >= 24`.

**Deps split**: il modern usa `vue@3` + `vue-router@4` + `vuex@4` + `@vueuse/head` + `@vueuse/motion`. Il legacy usa `vue2` (alias di `vue@2.7`) + `vue-router2` (alias di `vue-router@3`) + `vuex2` (alias di `vuex@3`) + polyfill (`core-js`, `whatwg-fetch`, `regenerator-runtime`, `intersection-observer`, `url-search-params-polyfill`). Nel legacy build gli alias di Vite swappano `vue → vue2`, `vue-router → src/lib/compat/vue-router-shim.js`, `vuex → src/lib/compat/vuex-shim.js`.

**Patch postinstall** (`scripts/patch-legacy-build.cjs`): crea uno shadow `node_modules/vue-template-compiler/node_modules/vue` con il package.json di Vue 2.7 per superare il sanity check di `vue-template-compiler` (che si aspetta `vue@2.x` al top-level mentre noi abbiamo `vue@3`). Eseguito automaticamente da `npm install`.

**Codice condiviso**: tutti i componenti `.vue`, `App.vue`, `store.js`, `router/index.js`, asset CSS. `store.js` e `router/index.js` rilevano runtime se sono su API v3 o v4 (Vuex 3/4 e vue-router 3/4) e si adattano. `main.js` (Vue 3) vs `main.legacy.js` (Vue 2.7) sono gli unici entry duplicati per il bootstrap.

**Define flag**: `__MODERN__` (`true` modern, `false` legacy) e `__VUE_BUILD__` (`'modern' | 'legacy'`) iniettati da Vite, usati per tree-shaking di rami legacy-only o modern-only.

**Compat shim** in `src/lib/compat/`:
- `teleport.js` — su modern espone `<Teleport>` nativo, su legacy emula via `document.body` appendChild.
- `head.js` — su modern delega a `@vueuse/head`, su legacy manipola `document.title` e `<meta>` direttamente.
- `vue-router-shim.js` — re-export di `vue-router2` con `useRoute`/`useRouter` (assenti in V3) implementati via `getCurrentInstance().proxy.$route/$router`. Side-effect: `Vue.use(VueRouter)` a load time.
- `vuex-shim.js` — analogo per Vuex 3 con `useStore` shim. Side-effect: `Vue.use(Vuex)` a load time. **Importante**: l'install side-effect deve avvenire prima di `new Vuex.Store()` / `new VueRouter()`, ecco perché è dentro lo shim e non in `main.legacy.js` (gli ES module imports sono hoisted).
- `vueuse-head-stub.js`, `vueuse-motion-stub.js` — no-op stub aliasati al posto di `@vueuse/head` e `@vueuse/motion` nel legacy build.

**Asset CSS dedicato legacy** (`src/assets/legacy-fallbacks.css`): `@supports not (color-mix(...))` con valori statici di fallback per nav/sidebar/modale/badge/hover, `@supports not (gap)` con margin fallback, `@supports not (grid)` con flex fallback per ThemeToggle e avatar.

**Feature degradate sul legacy**: animazioni (`@vueuse/motion` non caricato), 3D Three.js (`LandingHeroScene`/`LandingFeatureFlipDeck` esclusi via `__MODERN__` gating), realtime Supabase (solo polling come fallback), drag-drop kanban (button fallback già presente), backdrop-filter / color-mix / oklch (CSS fallback).

**Pattern HTML da rispettare** (vincoli Vue 2.7 vs Vue 3):
- `<i .../>`, `<span .../>`, `<div .../>` self-closing su HTML5 elements non-void: NON usare. Vue 2 li interpreta come tag aperti e mangia tutto fino al prossimo close, scombinando il template a partire da quel punto. Usare `<i></i>` esplicito.
- I custom component self-closing (`<MyComp />`) vanno bene grazie a `unplugin-vue2-script-setup`.
- Multiple v-models con argomenti (`v-model:foo` `v-model:bar`): non supportato in Vue 2. Usare `:foo` + `@update:foo`.
- `<Teleport>`: usare `TeleportCompat` da `lib/compat/teleport.js`.

**Strategia di deployment runtime selection**: TBD. Opzioni in `todo.md` (preferibile UA detect server-side in Strapi).

**Roadmap**: vedi `todo.md` per la roadmap completa.

## Tech debt / dead code
- **Auth (waiting for SMTP):** `Pages/Auth/VerifyEmail.vue`, `Pages/Auth/TwoFactorChallenge.vue`. Recommended providers: Sendgrid, Brevo, self-hosted Mailgun.
- **`Profile/Show.vue` unused props (Jetstream residue):** `confirmsTwoFactorAuthentication`, `sessions`. Clean up when 2FA ships.
- **Deprecated/deleted:** `Footer`, `DangerButton`, `SectionBorder`, `SectionTitle`, old `Checkbox`, `icons/`, `ConfirmPassword`, `DialogModal`, `PrimaryButton`, `SecondaryButton`, `MenuViewComponent`, `MenuView`, `MenuLayout`, `PrefsSetter`.
- **Utils dead code:** `fetchPublicMenu`, `fetchOrderTotal`, `isSubscriptionRequiredError`.

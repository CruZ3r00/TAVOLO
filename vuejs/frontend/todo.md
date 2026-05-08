# Legacy browser support — porting plan

Goal: gestionale operativo deve girare su Chrome 37+, Android 4.4+, IE11+, SeaMonkey vecchi (Gecko ~38+), accettando perdita di animazioni / 3D / realtime, mantenendo layout/struttura/funzioni identiche. Modern build invariato.

Strategia: **Vue 3 (modern) + Vue 2.7 (legacy) dallo stesso source dove possibile**, con `<script setup>` + Composition API supportate da entrambi via `@vitejs/plugin-vue2` + `unplugin-vue2-script-setup`. Logica estratta in `src/lib/*` framework-agnostic.

Browserslist target: `chrome >= 37, android >= 4.4, ios_saf >= 8, safari >= 8, firefox >= 38, ie >= 11, edge >= 12, samsung >= 4, opera >= 24`.

---

## Fase 0 — Setup dual-build infrastructure
- [x] Aggiornare `browserslist` in `package.json` con i target finali
- [x] Aggiungere dependencies legacy al `package.json` (vue 2.7, plugin-vue2, script-setup, polyfill, yup)
- [x] Creare `vite.config.legacy.mjs` (build Vue 2.7, alias, target `chrome >= 37`)
- [x] Creare `src/main.legacy.js` entry
- [x] Creare struttura `src/lib/compat/` con shim skeletons (teleport.js, head.js)
- [x] Aggiornare `index.html` con bootstrap loader ES3-safe (Proxy detection)
- [x] Aggiungere npm scripts (`build:modern`, `build:legacy`, `build:all`, `dev:legacy`)
- [x] Documentare comando `npm install` per le nuove deps
- [ ] **Utente**: eseguire `npm install` per installare le nuove deps
- [ ] **Utente**: verificare che `npm run build:modern` continui a funzionare invariato
- [ ] **Utente**: verificare che `npm run build:legacy` produca il bundle legacy (anche se vuoto inizialmente)

## Fase 1 — Estrazione logica condivisa (src/lib/*)

**Parte critica completata** (build modern verificato verde):
- [x] `src/lib/api/_base.js` — API_BASE, buildApiError, jsonHeaders, authHeaders
- [x] `src/lib/api/menu.js` — fetch/import/bulk
- [x] `src/lib/api/orders.js` — wrappers + orderErrorMessage
- [x] `src/lib/api/reservations.js` — wrappers + reservationErrorMessage
- [x] `src/lib/api/takeaways.js` — FSM wrappers
- [x] `src/lib/api/tables.js` — CRUD
- [x] `src/lib/api/billing.js` — Stripe checkout/portal
- [x] `src/lib/api/account.js` — staff/category-routing
- [x] `src/lib/api/pos.js` — pairing/devices/installer
- [x] `src/utils.js` ridotto a thin re-export (non-breaking per i componenti)
- [x] `src/lib/realtime.js` — Supabase con tree-shake automatico su legacy via `__MODERN__`
- [x] `src/supabase.js` ridotto a thin re-export
- [x] `src/lib/format.js` — currency/date/time/slot
- [x] `src/lib/compat/teleport.js` — shim teleport (Fase 0)
- [x] `src/lib/compat/head.js` — shim setHead (Fase 0)

**Differiti a Fase 2** (estraibili organicamente quando si rifattorizza ogni componente):
- [ ] `src/lib/state/orderFsm.js` — durante refactor Orders.vue / KitchenBoard
- [ ] `src/lib/state/reservationFsm.js` — durante refactor Reservations.vue
- [ ] `src/lib/state/lockVersion.js` — durante refactor OrderDetailModal
- [ ] `src/lib/duration.js` — durante refactor KitchenItemCard (timer)
- [ ] `src/lib/polling.js` — durante refactor Orders/Reservations/AppLayout (badge)
- [ ] `src/lib/qrcode.js` — durante refactor GeneratorQRCode / 2FA
- [ ] `src/lib/theme.js` — durante refactor ThemeToggle
- [ ] `src/lib/staffAccess.js` — già pure JS in `src/staffAccess.js`, lascia dove sta
- [ ] `src/lib/validation/yup-schemas.js` — durante refactor 4 forms Auth (Fase 2)
- [ ] `src/lib/validation/form.js` — durante refactor 4 forms Auth (Fase 2)

## Fase 2 — Refactor mirati Vue 3 → compat (riducono twin a 0)
- [x] `Modal.vue` — `<Teleport>` → `<TeleportCompat>` shim
- [x] `MenuImporter.vue` — 4 Teleport → shim
- [x] `MenuSetter.vue` — 2 Teleport → shim
- [x] `AppLayout.vue` — Teleport mobile drawer → shim
- [x] `TextInput.vue` — accetta sia `modelValue` (Vue 3) sia `value` (Vue 2), emette entrambi gli eventi
- [x] `OrdersTableGrid.vue` — `v-model:filter`/`v-model:search` → `:filter` + `@update:filter`
- [x] 4 pagine Auth (VerifyEmail, ForgotPassword, ResetPassword, TwoFactorChallenge): `vee-validate@4` → `yup` + `useFormState`
- [x] 3 pagine Auth (Register, Logout, Login): `@vueuse/head` → `@/lib/compat/head`
- [x] `LandingHeroScene.vue` / `LandingFeatureFlipDeck.vue` — già gated da `supportsWebGL()` capability check + `defineAsyncComponent`, niente da fare
- [x] `main.js` (modern) carica `MotionPlugin`; `main.legacy.js` non lo carica per scelta — niente da fare
- [ ] CSS: aggiungere `@supports` blocks per grid → flexbox fallback, `gap` → margin fallback (deferito a Fase 3 polish)

**Build verificati:**
- `npm run build:modern` → ✓ 12s, output invariato comportamentalmente
- `npm run build:legacy` → ✓ 41s, bundle 469kB (gzip 163kB) + chunks per pagina + polyfills 70kB

## Fase 3 — Polish, test, rifinitura
- [x] Build entrambi target, verifica output (modern 12s, legacy ~1-3min)
- [x] Smoke test SeaMonkey ~2.40 — landing renderizzata correttamente, tutti i componenti visibili
- [ ] Smoke test Chrome 37 reale (BrowserStack / VM) — TODO utente
- [ ] Smoke test Android 5 nativo — TODO utente
- [ ] Smoke test pagine operative (Login, Dashboard, Orders, Reservations, MenuSetter) su SeaMonkey — TODO utente
- [x] CSS `@supports` per `color-mix`, `gap`, `display: grid` (vedi `assets/legacy-fallbacks.css`)
- [x] Polyfill setup (core-js, whatwg-fetch, regenerator-runtime, intersection-observer, url-search-params-polyfill)
- [ ] Strategia di deployment runtime selection (vedi sezione sotto)
- [ ] Aggiornare `vuejs/frontend/CLAUDE.md` con sezione "Dual-build" aggiornata

## Note di runtime selection (per deployment futuro)

Servire i due bundle in produzione richiede una decisione su come scegliere quale serve a chi:

**Opzione A — UA detect server-side (Strapi)** ✦ raccomandato
- Strapi (o reverse proxy davanti) intercetta la prima request HTML e legge `User-Agent`.
- Se UA matcha pattern legacy (Chrome ≤49, Firefox ≤52, SeaMonkey, Android stock browser, IE), serve `dist/legacy/index.html`. Altrimenti serve `dist/modern/index.html`.
- Pro: zero overhead client, no flash di contenuto sbagliato.
- Contro: UA può essere falsificato (innocuo qui), serve mantenere lista UA pattern.
- Implementazione: middleware Strapi su rotte SPA, ~30 righe.

**Opzione B — Bootstrap shell client-side**
- Un terzo `index.html` minimal alla root con uno script ES3 che fa `if (!('Proxy' in window)) loadLegacy(); else loadModern();`.
- Carica dinamicamente `/modern/index.html` o `/legacy/index.html` content via fetch + replace document, oppure redirect.
- Pro: zero modifiche server.
- Contro: extra round-trip, possibile flash, gestione history più complicata.

**Opzione C (provvisoria) — Solo manuale**
- Path separati: `/` serve modern, `/legacy/` serve legacy. L'utente naviga manualmente al path giusto. Adatto per testing.

Per ora nei test usiamo C (entrambi serviti separatamente con `npx serve`). Quando si shippa, scegliere A.

---

## Note tecniche

**Perché Vue 2.7 e non solo plugin-legacy**: Vue 3 al runtime usa `Proxy`, non polyfillabile. plugin-legacy trasforma solo la sintassi, non il framework. Vue 2.7 supporta `<script setup>` + Composition API e gira su Chrome 37+.

**Perché yup invece di vee-validate**: vee-validate@4 ha API specifica Vue 3 (`useForm`). yup è pure JS, riusabile con un mini hook condiviso tra build.

**Realtime**: Supabase su build legacy usa solo polling. Wrapper in `lib/realtime.js` espone la stessa interfaccia ma fa no-op del WS quando feature-detect fallisce.

**Decisione finale Orders/Reservations**: dopo Fase 1+2, valutare se restano single-file con Vue 2.7-compat (probabile) o se si vuole comunque spezzarli in `.legacy.vue` per safety.

**Stima totale rivista**: 135-215h (3.5-5.5 settimane full-time) con strategia compressa, vs 460h (11-12 settimane) per port manuale Vue 2 Options API.

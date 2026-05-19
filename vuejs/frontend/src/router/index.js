// Compat vue-router 3 (Vue 2.7 / legacy build) + vue-router 4 (Vue 3 / modern build).
// vue-router 4 esporta `createRouter`/`createWebHistory`; v3 espone la classe `VueRouter`
// con `mode: 'history'`. Su Vue 2 + vue-router 3 e' obbligatorio `Vue.use(VueRouter)`
// PRIMA di istanziare il router (altrimenti `new VueRouter()` fallisce). Lo facciamo
// qui (side-effect a load time) perche' gli ES modules import sono "hoisted" e il
// router viene istanziato al top-level prima delle istruzioni in main.legacy.js.
// Le guard hanno la stessa API in entrambe le versioni.
import * as VueNS from 'vue'
import * as VueRouterNS from 'vue-router'
import { store } from '@/store'; //usato per storage di jwt
import { fetchBillingStatus } from '@/utils';
import { STAFF_ROLES, canAccessRoute, defaultRouteForUser, staffRole } from '@/staffAccess';

const VueDefault = VueNS.default || VueNS;
const VueRouterDefault = VueRouterNS.default || VueRouterNS;
const isV4 = typeof VueRouterNS.createRouter === 'function';

if (!isV4 && VueDefault && typeof VueDefault.use === 'function') {
  VueDefault.use(VueRouterDefault);
}

const createRouter = isV4
  ? VueRouterNS.createRouter
  : (options) => new VueRouterDefault({ mode: 'history', routes: options.routes });
const createWebHistory = isV4
  ? VueRouterNS.createWebHistory
  : () => undefined; // su v3 il `history` viene gestito via `mode: 'history'` sopra

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const SUBSCRIPTION_CHECK_TIMEOUT_MS = 5000;
const SUBSCRIPTION_CHECK_CACHE_MS = 15000;
const SUBSCRIPTION_CHECK_FAILURE_BACKOFF_MS = 10000;
const PRO_STAFF_ROLES = new Set([STAFF_ROLES.GESTIONE, STAFF_ROLES.BAR, STAFF_ROLES.PIZZERIA, STAFF_ROLES.CUCINA_SG]);
let billingCache = { token: null, value: null, expiresAt: 0 };
let billingInFlight = null;
let lastBillingFailureAt = 0;

const withTimeout = (promise, ms) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const err = new Error('Controllo abbonamento non disponibile.');
            err.code = 'SUBSCRIPTION_CHECK_TIMEOUT';
            reject(err);
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const getBillingStatusCached = async (token) => {
    const now = Date.now();
    if (billingCache.token === token && billingCache.value && billingCache.expiresAt > now) {
        return billingCache.value;
    }
    if (billingInFlight && billingInFlight.token === token) {
        return billingInFlight.promise;
    }
    if (now - lastBillingFailureAt < SUBSCRIPTION_CHECK_FAILURE_BACKOFF_MS) {
        return null;
    }

    const promise = withTimeout(fetchBillingStatus(token), SUBSCRIPTION_CHECK_TIMEOUT_MS)
        .then((billing) => {
            billingCache = {
                token,
                value: billing,
                expiresAt: Date.now() + SUBSCRIPTION_CHECK_CACHE_MS,
            };
            lastBillingFailureAt = 0;
            return billing;
        })
        .catch((err) => {
            lastBillingFailureAt = Date.now();
            throw err;
        })
        .finally(() => {
            if (billingInFlight && billingInFlight.promise === promise) {
                billingInFlight = null;
            }
        });

    billingInFlight = { token, promise };
    return promise;
};

const routes = [
    { //non protetta
      path: '/register',
      name: 'register',
      component: ()  => import('../Pages/Auth/Register.vue'),
    },
    { //non protetta
        path: '/login',
        name: 'login',
        component: () => import('../Pages/Auth/Login.vue'),
    },
    {
        path: '/two-factor-challenge',
        name: 'two-factor-challenge',
        component: () => import('../Pages/Auth/TwoFactorChallenge.vue'),
    },
    { //non protetta - step 2 della registrazione (scelta piano + redirect Stripe)
        path: '/choose-plan',
        name: 'choose-plan',
        component: () => import('../Pages/ChoosePlan.vue'),
    },
    { //non protetta — landing pubblica per ospiti
        path: '/landing',
        name: 'landing',
        component: () => import('../Pages/Landing.vue'),
    },
    { //smart-redirect — al loaded user va in dashboard, ai guest in landing
        path: '/',
        redirect: () => store.getters.isAuthenticated ? defaultRouteForUser(store.getters.getUser) : '/landing',
    },
    { //smart-redirect storico
        path: '/home',
        redirect: () => store.getters.isAuthenticated ? defaultRouteForUser(store.getters.getUser) : '/landing',
    },
    { //protetta — manager dashboard
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('../Pages/Dashboard.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE] },
    },
    { //non protetta
        path: '/terms',
        name: 'terms',
        component: () => import('../Pages/TermsOfService.vue'),
    },
    { //non protetta
        path: '/privacy-policy',
        name: 'privacy-policy',
        component: () => import('../Pages/PrivacyPolicy.vue'),
    },
    { //protetta
        path: '/logout',
        name: 'Logging out...',
        component: () => import('../Pages/Auth/Logout.vue'),
        meta: { requiresAuth: true },
    },
    { //non protetta
        path: '/forgot-password',
        name: 'Recover password...',
        component: () => import('../Pages/Auth/ForgotPassword.vue'),
    },
    { //non protetta
        path: '/reset-password',
        name: 'Reset password',
        component: () => import('../Pages/Auth/ResetPassword.vue'),
    },
    { //protetta
        path: '/menu-handler',
        name: 'Menu setter',
        component: () => import('../Pages/MenuSetter.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE] },
    },
    { //protetta
        path: '/profile/show',
        name: 'Your profile',
        component: () => import('../Pages/Profile/Show.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE] },
    },
    { //protetta - Gestione prenotazioni
        path: '/reservations',
        name: 'Prenotazioni',
        component: () => import('../Pages/Reservations.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE] },
    },
    { //protetta - Gestione ordinazioni (sala)
        path: '/orders',
        name: 'Sala',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, ordersMode: 'cameriere', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE] },
    },
    { //protetta - Vista cucina
        path: '/kitchen',
        name: 'Cucina',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, ordersMode: 'cucina', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CUCINA] },
    },
    { //protetta - Vista bar
        path: '/bar',
        name: 'Bar',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, requiresPlan: 'pro', ordersMode: 'bar', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.BAR] },
    },
    { //protetta - Vista pizzeria
        path: '/pizzeria',
        name: 'Pizzeria',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, requiresPlan: 'pro', ordersMode: 'pizzeria', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.PIZZERIA] },
    },
    { //protetta - Vista cucina senza glutine
        path: '/kitchen-sg',
        name: 'Cucina SG',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, requiresPlan: 'pro', ordersMode: 'cucina_sg', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CUCINA_SG] },
    },
    { //protetta - Carico bar (solo staff bar pro / cucina starter)
        path: '/bar-management',
        name: 'Carico bar',
        component: () => import('../Pages/BarManagement.vue'),
        // Owner e gestione accedono al pannello via il bottone "Turno bar"
        // dentro la tab Bevande del MenuSetter. Il gating piano (BAR pro /
        // CUCINA starter) e' applicato dal middleware backend
        // `subscription-gate.js` e dal nav-helper `canSeeNavItem`.
        meta: {
            requiresAuth: true,
            requiresSubscription: true,
            staffRoles: [STAFF_ROLES.BAR, STAFF_ROLES.CUCINA],
        },
    },
    { //non protetta
        path: '/who-are-us',
        name: 'Chi siamo',
        component: () => import('../Pages/WhoAreUs.vue'),
    },
    { //non protetta
        path: '/contact-us',
        name: 'Contattaci',
        component: () => import('../Pages/ContactUs.vue'),
    },
    { // protetta
        path: '/renew-sub',
        name: 'Rinnova l\'abbonamento',
        component: () => import('../Pages/RenewSub.vue'),
        meta: { requiresAuth: true },
    },
    { // protetta
        path: '/add-payment',
        name: 'Inserisci dati per il pagamento',
        component: () => import('../Pages/AddPayment.vue'),
        meta: { requiresAuth: true },
    },
    { //non protetta
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('../Pages/NotFound.vue'),
    },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
    const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
    let isAuthenticated = store.getters.isAuthenticated;

    if (requiresAuth && !store.getters.sessionChecked) {
        const restored = await store.dispatch('refreshSession');
        isAuthenticated = restored && store.getters.isAuthenticated;
    }

    // Guest che cerca di entrare in route protetta -> rimanda alla landing
    if (requiresAuth && !isAuthenticated) {
        next({ name: 'landing' });
        return;
    }

    // Utente loggato che apre /login o /register -> rimanda alla dashboard
    if (isAuthenticated && ['login', 'register', 'landing'].includes(to.name)) {
        next(defaultRouteForUser(store.getters.getUser));
        return;
    }

    if (isAuthenticated && to.matched.some(record => record.meta.requiresSubscription)) {
        try {
            const billing = await getBillingStatusCached(store.getters.getToken);

            if (billing) {
                const user = { ...(store.getters.getUser || {}), ...billing };
                store.commit('setUser', user);
                localStorage.setItem('user', JSON.stringify(user));
            }

            if (billing && !ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscription_status)) {
                next({ path: '/renew-sub', query: { checkout: 'retry', reason: 'expired' } });
                return;
            }

            const role = staffRole(store.getters.getUser);
            if (
                billing &&
                billing.subscription_plan === 'starter' &&
                PRO_STAFF_ROLES.has(role)
            ) {
                next({ path: '/renew-sub', query: { checkout: 'retry', reason: 'pro-required' } });
                return;
            }
        } catch (err) {
            if (err?.status === 401) {
                store.dispatch('logout');
                next({ name: 'landing' });
                return;
            }

            if (err?.status === 403) {
                console.warn('Subscription check forbidden:', err);
                next();
                return;
            }

            if (err?.status === 402 || err?.code === 'SUBSCRIPTION_REQUIRED') {
                next({ path: '/renew-sub', query: { checkout: 'retry', reason: 'expired' } });
                return;
            }

            console.warn('Subscription check skipped:', err);
            next();
            return;
        }
    }

    if (isAuthenticated && !canAccessRoute(store.getters.getUser, to)) {
        const fallback = defaultRouteForUser(store.getters.getUser);
        next(to.path === fallback ? false : fallback);
        return;
    }

    next();
});

export default router

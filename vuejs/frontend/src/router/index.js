import { createRouter, createWebHistory } from 'vue-router'
import { store } from '@/store'; //usato per storage di jwt
import { fetchBillingStatus } from '@/utils';
import { STAFF_ROLES, canAccessRoute, defaultRouteForUser, staffRole } from '@/staffAccess';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const SUBSCRIPTION_CHECK_TIMEOUT_MS = 5000;
const PRO_STAFF_ROLES = new Set([STAFF_ROLES.GESTIONE, STAFF_ROLES.BAR, STAFF_ROLES.PIZZERIA, STAFF_ROLES.CUCINA_SG]);

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
        meta: { requiresAuth: true, requiresSubscription: true, ordersMode: 'bar', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.BAR] },
    },
    { //protetta - Vista pizzeria
        path: '/pizzeria',
        name: 'Pizzeria',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, ordersMode: 'pizzeria', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.PIZZERIA] },
    },
    { //protetta - Vista cucina senza glutine
        path: '/kitchen-sg',
        name: 'Cucina SG',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true, ordersMode: 'cucina_sg', staffRoles: [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CUCINA, STAFF_ROLES.CUCINA_SG] },
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
    const isAuthenticated = store.getters.isAuthenticated;

    // Guest che cerca di entrare in route protetta -> rimanda alla landing
    if (to.matched.some(record => record.meta.requiresAuth) && !isAuthenticated) {
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
            const billing = await withTimeout(
                fetchBillingStatus(store.getters.getToken),
                SUBSCRIPTION_CHECK_TIMEOUT_MS
            );

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
            if (err?.status === 401 || err?.status === 403) {
                store.dispatch('logout');
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                next({ name: 'landing' });
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

import { createRouter, createWebHistory } from 'vue-router'
import { store } from '@/store'; //usato per storage di jwt
import { fetchBillingStatus } from '@/utils';

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
    { //non protetta
        path: '/', // Path to the dash
        name: 'Dashboard',
        component: () => import('../Pages/Dashboard.vue'),
    },
    { //non protetta
      path: '/home', // Path to the dash
      name: 'home',
      component: () => import('../Pages/Dashboard.vue'),
    },
    { //non protetta
        path: '/dashboard', // Path to the dash
        name: 'dashboard',
        component: () => import('../Pages/Dashboard.vue'),
    },
    { //non protetta
        path: '/terms', // Route to the Terms of Service
        name: 'terms',
        component: () => import('../Pages/TermsOfService.vue'),
    },
    { //non protetta
        path: '/privacy-policy', // Path to the Privacy Policy
        name: 'privacy-policy',
        component: () => import('../Pages/PrivacyPolicy.vue'),
    },
    { //protetta
        path: '/logout', // Path to logout
        name: 'Logging out...',
        component: () => import('../Pages/Auth/Logout.vue'),
        meta: { requiresAuth: true },
    },
    { //non protetta
        path: '/forgot-password',
        name: 'Recover password...',
        component: () => import('../Pages/Auth/ForgotPassword.vue'),
    },
    { //protetta
        path: '/menu-handler',
        name: 'Menu setter',
        component: () => import('../Pages/MenuSetter.vue'),
        meta: { requiresAuth: true, requiresSubscription: true },
    },
    { //protetta
        path: '/profile/show', // Path to profile
        name: 'Your profile',
        component: () => import('../Pages/Profile/Show.vue'),
        meta: { requiresAuth: true, requiresSubscription: true },
    },
    { //protetta - Gestione prenotazioni
        path: '/reservations',
        name: 'Prenotazioni',
        component: () => import('../Pages/Reservations.vue'),
        meta: { requiresAuth: true, requiresSubscription: true },
    },
    { //protetta - Gestione ordinazioni
        path: '/orders',
        name: 'Ordinazioni',
        component: () => import('../Pages/Orders.vue'),
        meta: { requiresAuth: true, requiresSubscription: true },
    },
    { //non protetta
        path: '/who-are-us', // Route per pagina chi siamo
        name: 'Chi siamo',
        component: () => import('../Pages/WhoAreUs.vue'),
    },
    { //non protetta
        path: '/contact-us', // Route for contact page
        name: 'Contattaci',
        component: () => import('../Pages/ContactUs.vue'),
    },
    { // protetta
        path: '/renew-sub', // Route for renew subscription
        name: 'Rinnova l\'abbonamento',
        component: () => import('../Pages/RenewSub.vue'),
        meta: { requiresAuth: true },
    },
    { // protetta
        path: '/add-payment', // Route to add payment method
        name: 'Inserisci dati per il pagamento',
        component: () => import('../Pages/AddPayment.vue'),
        meta: { requiresAuth: true },
    },
    { //non protetta
        path: '/:pathMatch(.*)*', // Route for 404 errors
        name: 'NotFound',
        component: () => import('../Pages/NotFound.vue'),
    },
];

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Protected route management (auth)
router.beforeEach(async (to, from, next) => {
    const isAuthenticated = store.getters.isAuthenticated;
    if (to.matched.some(record => record.meta.requiresAuth) && !isAuthenticated) {
        next({ name: 'login' });
        return;
    }

    if (isAuthenticated && to.matched.some(record => record.meta.requiresSubscription)) {
        try {
            const billing = await fetchBillingStatus(store.getters.getToken);
            const user = { ...(store.getters.getUser || {}), ...billing };
            store.commit('setUser', user);
            localStorage.setItem('user', JSON.stringify(user));

            if (!['active', 'trialing'].includes(billing?.subscription_status)) {
                next({ path: '/renew-sub', query: { checkout: 'retry' } });
                return;
            }
        } catch (_err) {
            next({ path: '/renew-sub', query: { checkout: 'retry' } });
            return;
        }
    }

    next();
});

export default router

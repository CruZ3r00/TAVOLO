import { createRouter, createWebHistory } from 'vue-router'
import { store } from '@/store'; //usato per storage di jwt

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
        component: () => import('../Pages/TermsOfService.vue'), // The component that will be loaded for this path
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
        meta: { requiresAuth: true }, // Protect this route
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
        meta: { requiresAuth: true }, // Protect this route
    },
    { //protetta
        path: '/profile/show', // Path to profile
        name: 'Your profile',
        component: () => import('../Pages/Profile/Show.vue'),
        meta: { requiresAuth: true }, // Protect this route
    },
    { //protetta
        path: '/prefs-handler', 
        name: 'Preferences',
        component: () => import('../Pages/PrefsSetter.vue'),
        meta: { requiresAuth: true }, // Protect this route
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
        meta: { requiresAuth: true }, // Protect this route
    },
    { // protetta
        path: '/add-payment', // Route to add payment method
        name: 'Inserisci dati per il pagamento',
        component: () => import('../Pages/AddPayment.vue'),
        meta: { requiresAuth: true }, // Protect this route
    },
    {
        path: '/menu/:restaurant/:category',
        name: 'Menu',
        component: () => import('../Pages/MenuView.vue'),
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
router.beforeEach((to, from, next) => {
    const isAuthenticated = store.getters.isAuthenticated;  // Vuex è già accessibile globalmente
    if (to.matched.some(record => record.meta.requiresAuth) && !isAuthenticated) {
        next({ name: 'login' }); // Reindirizza se non autenticato
    } else {
        next(); // Altrimenti vai avanti
    }
  });

export default router

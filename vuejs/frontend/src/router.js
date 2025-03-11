// router.js
import { createRouter, createWebHistory } from 'vue-router';

// Definisci le rotte
const routes = [
    {
        path: '/register',
        name: 'register',
        component: ()  => import('@/Pages/Auth/Register.vue'),
    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/Pages/Auth/Login.vue'),
    },
    {
        path: '/dashboard', // Path to the dash
        name: 'dashboard',
        component: () => import('@/Pages/Dashboard.vue'),
        meta: { requiresAuth: true }, // Protect this route
    },
    {
        path: '/terms', // Route to the Terms of Service
        name: 'terms',
        component: () => import('@/Pages/TermsOfService.vue'), // The component that will be loaded for this path
    },
    {
        path: '/privacy-policy', // Path to the Privacy Policy
        name: 'privacy-policy',
        component: () => import('@/Pages/PrivacyPolicy.vue'), 
    },
    {
        path: '/logout', // Path to logout
        name: 'Logging out...',
        component: () => import('@/Pages/Auth/Logout.vue'),
    },
    {
        path: '/forgot-password', 
        name: 'Recover password...',
        component: () => import('@/Pages/Auth/ForgotPassword.vue'),
    },
    {
        path: '/:pathMatch(.*)*', // Route for 404 errors
        name: 'NotFound',
        component: () => import('@/Pages/NotFound.vue'),
    },
];

// Create router
const router = createRouter({
    history: createWebHistory(),
    routes,
});

// Protected route management (auth)
router.beforeEach((to, from, next) => {
    const loggedIn = sessionStorage.getItem('authToken');
    if (to.matched.some(record => record.meta.requiresAuth) && !loggedIn) {
        next({ name: 'login' }); // Redirects if not logged in
    } else {
        next(); // Otherwise go on
    }
});

export default router;
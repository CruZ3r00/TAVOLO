import { createRouter, createWebHistory } from 'vue-router'



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
        name: 'Menu',
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
  const loggedIn = sessionStorage.getItem('authToken');
  if (to.matched.some(record => record.meta.requiresAuth) && !loggedIn) {
      next({ name: 'login' }); // Redirects if not logged in
  } else {
      next(); // Otherwise go on
  }
});

export default router

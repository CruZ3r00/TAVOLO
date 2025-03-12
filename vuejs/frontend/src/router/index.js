import { createRouter, createWebHistory } from 'vue-router'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/register',
      name: 'register',
      component: ()  => import('../Pages/Auth/Register.vue'),
  },
  {
      path: '/login',
      name: 'login',
      component: () => import('../Pages/Auth/Login.vue'),
  },
  {
      path: '/dashboard', // Path to the dash
      name: 'dashboard',
      component: () => import('../Pages/Dashboard.vue'),
  },
  {
      path: '/terms', // Route to the Terms of Service
      name: 'terms',
      component: () => import('../Pages/TermsOfService.vue'), // The component that will be loaded for this path
  },
  {
      path: '/privacy-policy', // Path to the Privacy Policy
      name: 'privacy-policy',
      component: () => import('../Pages/PrivacyPolicy.vue'), 
  },
  {
      path: '/logout', // Path to logout
      name: 'Logging out...',
      component: () => import('../Pages/Auth/Logout.vue'),
  },
  {
      path: '/forgot-password', 
      name: 'Recover password...',
      component: () => import('../Pages/Auth/ForgotPassword.vue'),
  },
  {
      path: '/:pathMatch(.*)*', // Route for 404 errors
      name: 'NotFound',
      component: () => import('../Pages/NotFound.vue'),
  },
  ],
})

export default router

import { createRouter, createWebHashHistory } from 'vue-router';
import { devicePersistence } from '../core/persistence';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/pair', component: () => import('../views/Pair.vue'), meta: { public: true } },
  { path: '/dashboard', component: () => import('../views/Dashboard.vue') },
  { path: '/settings', component: () => import('../views/Settings.vue') },
  { path: '/discovery', component: () => import('../views/DeviceDiscovery.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const paired = await devicePersistence.isPaired();
  if (!paired) return { path: '/pair' };
  return true;
});

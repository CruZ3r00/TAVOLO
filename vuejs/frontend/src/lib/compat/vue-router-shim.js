// Re-export di vue-router con shim per `useRoute`/`useRouter` mancanti in V3.
// Vue Router 4 (Vue 3) esporta `useRoute`/`useRouter` come hook.
// Vue Router 3 (Vue 2.7) NO — gli accessi avvengono via `this.$route`/`this.$router`
// dal proxy del component instance ottenuto con `getCurrentInstance()`.
//
// Questo file e' aliasato a `vue-router` SOLO nel legacy build (vedi
// `vite.config.legacy.mjs`). Nel modern build l'alias non e' presente e
// `vue-router` resolve direttamente a `vue-router@4` con tutti gli hook nativi.

import Vue from 'vue';
import VueRouter from 'vue-router2';
import * as VueRouterNS from 'vue-router2';
import { getCurrentInstance } from 'vue';

// Side-effect: installa VueRouter su Vue 2 PRIMA di qualunque `new VueRouter(...)`.
// Aliasato a `vue-router` solo nel legacy build, quindi Vue qui e' sempre Vue 2.7.
if (Vue && typeof Vue.use === 'function') {
  Vue.use(VueRouter);
}

export default VueRouter;

// Vue Router 3 named exports: RouterLink, RouterView, NavigationFailureType, ecc.
export const RouterLink = VueRouterNS.RouterLink;
export const RouterView = VueRouterNS.RouterView;
export const NavigationFailureType = VueRouterNS.NavigationFailureType;
export const START_LOCATION = VueRouterNS.START_LOCATION;
export const isNavigationFailure = VueRouterNS.isNavigationFailure;
export const version = VueRouterNS.version;

// Hook shim: leggono `$route`/`$router` dall'instance corrente Vue 2.
const syncRoute = (target, nextRoute = {}) => {
  Object.keys(target).forEach((key) => {
    if (!(key in nextRoute)) Vue.delete(target, key);
  });
  Object.keys(nextRoute).forEach((key) => {
    Vue.set(target, key, nextRoute[key]);
  });
};

export function useRoute() {
  const inst = getCurrentInstance();
  const vm = inst && inst.proxy;
  if (!vm) return {};

  const route = Vue.observable({});
  syncRoute(route, vm.$route || {});

  const unwatch = vm.$watch('$route', (nextRoute) => {
    syncRoute(route, nextRoute || {});
  });

  if (typeof vm.$once === 'function') {
    vm.$once('hook:beforeDestroy', unwatch);
  }

  return route;
}

export function useRouter() {
  const inst = getCurrentInstance();
  return inst && inst.proxy ? inst.proxy.$router : {};
}

// API V4 di compat (createRouter/createWebHistory) sono gia' in `router/index.js`
// ma re-esportiamo versioni minimali nel caso vengano importate da altri file.
export function createRouter(options) {
  return new VueRouter({ mode: 'history', routes: options.routes });
}

export function createWebHistory() {
  return undefined;
}

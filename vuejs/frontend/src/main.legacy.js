// Entry point per il build legacy (Vue 2.7).
// Il codice in `App.vue`, components, Pages, store.js, router/index.js e' shared
// con il modern build: Vue 2.7 supporta Composition API + <script setup>
// (via unplugin-vue2-script-setup, configurato in vite.config.legacy.mjs).
//
// Differenze runtime rispetto a main.js (Vue 3):
//   - bootstrap via `new Vue({...}).$mount('#app')` invece di `createApp(App).mount('#app')`
//   - Vuex e VueRouter vanno installati globalmente con `Vue.use(...)` prima di istanziarli
//   - niente @vueuse/head (gestito da `lib/compat/head.js`, no-op su legacy)
//   - niente MotionPlugin (animazioni assenti per scelta)

import 'core-js/stable';
import 'regenerator-runtime/runtime';
import 'whatwg-fetch';
import 'intersection-observer';
import 'url-search-params-polyfill';

import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuex from 'vuex';

import App from './App.vue';
import router from './router';
import { store } from './store';
import { installCredentialedFetch } from './lib/api/fetch-credentials';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './assets/design-system.css';
import './assets/tavolo-screens.css';
import './assets/comfortables.css';
// IMPORTANTE: legacy-fallbacks.css va caricato DOPO gli altri CSS per avere
// la priorita' di cascade quando i `@supports not (...)` matchano.
import './assets/legacy-fallbacks.css';

installCredentialedFetch();

Vue.config.productionTip = false;
Vue.use(VueRouter);
Vue.use(Vuex);

new Vue({
  router,
  store,
  render: (h) => h(App),
}).$mount('#app');

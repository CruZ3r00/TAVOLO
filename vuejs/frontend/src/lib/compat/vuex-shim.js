// Re-export di vuex con shim per `useStore` mancante in V3.
// Vuex 4 (Vue 3) esporta `useStore`. Vuex 3 NO — accesso via `this.$store`.
//
// Aliasato a `vuex` SOLO nel legacy build.

import Vue from 'vue';
import Vuex from 'vuex2';
import * as VuexNS from 'vuex2';
import { getCurrentInstance } from 'vue';

// Side-effect: installa Vuex su Vue 2 PRIMA di qualunque `new Vuex.Store()`.
// Questo file e' aliasato a `vuex` solo nel legacy build, quindi Vue qui e'
// sempre Vue 2.7 con `Vue.use`.
if (Vue && typeof Vue.use === 'function') {
  Vue.use(Vuex);
}

export default Vuex;
export const Store = VuexNS.Store;
export const install = VuexNS.install;
export const mapState = VuexNS.mapState;
export const mapGetters = VuexNS.mapGetters;
export const mapActions = VuexNS.mapActions;
export const mapMutations = VuexNS.mapMutations;
export const createNamespacedHelpers = VuexNS.createNamespacedHelpers;
export const createLogger = VuexNS.createLogger;

export function useStore() {
  const inst = getCurrentInstance();
  return inst && inst.proxy ? inst.proxy.$store : null;
}

export function createStore(options) {
  return new Vuex.Store(options);
}

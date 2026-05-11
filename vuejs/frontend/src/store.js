// Compat Vuex 3 (Vue 2.7 / legacy build) + Vuex 4 (Vue 3 / modern build).
// Vuex 3 esporta la classe via default `Vuex.Store`; Vuex 4 esporta la factory `createStore`.
// Su Vue 2 + Vuex 3 e' obbligatorio chiamare `Vue.use(Vuex)` PRIMA di istanziare
// lo store, altrimenti `new Vuex.Store()` fallisce con "Vue is not a constructor"
// quando crea il suo `_watcherVM`. Lo facciamo qui (side-effect a load time)
// invece che in main.legacy.js, perche' gli ES modules import sono "hoisted"
// e store viene istanziato al top-level prima delle istruzioni nello main.
import * as VueNS from 'vue';
import * as VuexNS from 'vuex';

const VueDefault = VueNS.default || VueNS;
const VuexDefault = VuexNS.default || VuexNS;
const isVuex3 = typeof VuexNS.createStore !== 'function';

if (isVuex3 && VueDefault && typeof VueDefault.use === 'function') {
  VueDefault.use(VuexDefault);
}

const createStore = typeof VuexNS.createStore === 'function'
  ? VuexNS.createStore
  : (options) => new VuexDefault.Store(options);

export const store = createStore({
  state() {
    return {
      user: JSON.parse(localStorage.getItem('user')) || null,
      token: localStorage.getItem('token') || null,
    };
  },
  mutations: {
    setUser(state, userData) {
      state.user = userData;
    },
    setToken(state, token) {
      state.token = token;
    },
    logout(state) {
      state.user = null;
      state.token = null;
    },
  },
  actions: {
    login({ commit }, { user, token }) {
      commit('setUser', user);
      commit('setToken', token);
    },
    logout({ commit }) {
      commit('logout');
    },
  },
  getters: {
    isAuthenticated(state) {
      return state.token !== null;
    },
    getUser(state) {
      return state.user;
    },
    getToken(state){
      return state.token;
    }
  },
});

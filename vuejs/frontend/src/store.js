// Compat Vuex 3 (Vue 2.7 / legacy build) + Vuex 4 (Vue 3 / modern build).
// Vuex 3 esporta la classe via default `Vuex.Store`; Vuex 4 esporta la factory `createStore`.
// Su Vue 2 + Vuex 3 e' obbligatorio chiamare `Vue.use(Vuex)` PRIMA di istanziare
// lo store, altrimenti `new Vuex.Store()` fallisce con "Vue is not a constructor"
// quando crea il suo `_watcherVM`. Lo facciamo qui (side-effect a load time)
// invece che in main.legacy.js, perche' gli ES modules import sono "hoisted"
// e store viene istanziato al top-level prima delle istruzioni nello main.
import * as VueNS from 'vue';
import * as VuexNS from 'vuex';
import { API_BASE } from './lib/api/_base';

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
      sessionChecked: false,
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
    setSessionChecked(state, checked) {
      state.sessionChecked = checked;
    },
  },
  actions: {
    login({ commit }, { user, token, remember = true }) {
      commit('setUser', user);
      commit('setToken', token || null);
      if (user) localStorage.setItem('user', JSON.stringify(user));
      if (remember && token) localStorage.setItem('token', token);
      else localStorage.removeItem('token');
    },
    logout({ commit }) {
      commit('logout');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
    async refreshSession({ commit, state }) {
      try {
        const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
        const resp = await fetch(`${API_BASE}/api/users/me`, {
          credentials: 'include',
          headers,
        });
        if (!resp.ok) {
          commit('logout');
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          return false;
        }
        const user = await resp.json();
        commit('setUser', user);
        commit('setToken', state.token || null);
        localStorage.setItem('user', JSON.stringify(user));
        return true;
      } catch (_err) {
        commit('logout');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        return false;
      } finally {
        commit('setSessionChecked', true);
      }
    },
    // Refresh user payload (es. dopo cambio piano Stripe o mount AppLayout) senza
    // toccare sessionChecked ne forzare logout su errore — fail-soft.
    async refreshUser({ commit, state }) {
      if (!state.user && !state.token) return false;
      try {
        const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
        const resp = await fetch(`${API_BASE}/api/users/me`, {
          credentials: 'include',
          headers,
        });
        if (!resp.ok) return false;
        const user = await resp.json();
        commit('setUser', user);
        localStorage.setItem('user', JSON.stringify(user));
        return true;
      } catch (_err) {
        return false;
      }
    },
  },
  getters: {
    isAuthenticated(state) {
      return state.token !== null || state.user !== null;
    },
    getUser(state) {
      return state.user;
    },
    getToken(state){
      return state.token;
    },
    sessionChecked(state) {
      return state.sessionChecked;
    }
  },
});

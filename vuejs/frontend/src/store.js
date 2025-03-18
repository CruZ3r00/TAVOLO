import { createStore } from 'vuex';

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

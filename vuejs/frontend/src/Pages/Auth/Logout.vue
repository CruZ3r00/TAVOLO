<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { useStore } from 'vuex';

useHead({
  title: 'Logout',
  meta: [{ name: 'description', content: 'Logout page for the app' }],
});

const store = useStore();
const router = useRouter();
const errorMessage = ref('');

const logout = () => {
  store.dispatch('logout');
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  console.log('Logout effettuato');
  router.push('/login');
};

// Log out immediately after loading
logout();
</script>

<template>
  <div class="logout-page">
    <div v-if="errorMessage" class="ds-alert ds-alert-error">
      <i class="bi bi-exclamation-circle"></i>
      <span>{{ errorMessage }}</span>
    </div>
    <div v-else class="logout-loading">
      <span class="ds-spinner"></span>
      <p>Logout in corso...</p>
    </div>
  </div>
</template>

<style scoped>
.logout-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  font-family: var(--f-sans, 'Geist', sans-serif);
}
.logout-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-4);
  color: var(--ink-3);
  font-size: 14px;
}
.logout-loading :deep(.ds-spinner) {
  width: 32px;
  height: 32px;
  border: 3px solid var(--line);
  border-top-color: var(--ac);
  border-radius: 50%;
  animation: lo-spin 650ms linear infinite;
}
@keyframes lo-spin { to { transform: rotate(360deg); } }
</style>

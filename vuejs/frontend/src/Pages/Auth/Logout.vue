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
  background: var(--color-bg);
}
.logout-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>

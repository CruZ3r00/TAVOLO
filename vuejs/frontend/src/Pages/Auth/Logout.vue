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
  <div>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-else>Logout in corso...</p>
  </div>
</template>

<style scoped>
.error {
  color: red;
}
</style>
 
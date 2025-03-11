<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import { ref } from 'vue';

useHead({
  title: 'Logout',
  meta: [{ name: 'description', content: 'Logout page for the app' }],
});

const router = useRouter();
const errorMessage = ref('');

const logout = async () => {
  const refreshToken = sessionStorage.getItem('refreshToken');
  errorMessage.value = '';

  try {
    const response = await fetch('http://localhost:8000/logout/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      // Clean up the sessionStorage
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('username');
      router.push('/login');
    } else {
      const errorData = await response.json();
      errorMessage.value = errorData.error || 'Errore durante il logout.';
    }
  } catch (error) {
    errorMessage.value = 'Errore di rete. Riprova più tardi.';
  }
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
 
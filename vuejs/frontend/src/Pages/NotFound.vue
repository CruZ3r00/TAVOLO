<script setup> //pagina per visualizzare rotte non definite
import { nextTick } from 'vue'; 

// Imposta il titolo della pagina
onMounted(async () => {
        nextTick(() => {
            document.title = 'Not Found - 404';
        });
});
</script>

<template> <!-- Pagina in caso di url sbagliati -->
    <div class="not-found">
      <h1 class="text-center text-xl font-bold">404 - Page Not Found</h1>
      <p class="text-center">Sorry, the page you're looking for does not exist.</p>
    </div>
</template>

  <style scoped>
  .not-found {
    padding: 2rem;
    text-align: center;
    font-size: 1.5rem;
    color: #333;
  }
  </style>
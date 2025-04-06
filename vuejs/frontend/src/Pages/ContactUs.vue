<script setup> //pagina che contiene le informazioni di contatto della nostra "societa'"
    import AppLayout from '@/Layouts/AppLayout.vue';import { nextTick } from 'vue'; 

  // Imposta il titolo della pagina
  onMounted(async () => {
          nextTick(() => {
              document.title = 'Contattaci';
          });
  });
</script>

<template>
  <AppLayout>
    <div class="conctact">
      <h1 class="text-center text-xl font-bold">Puoi contattarci ai seguenti indirizzi mail o numeri di telefono</h1>
      <p class="text-center">Filippo: filippomanzini02@outlook.com, +39 345 790 3167;</p>
      <p class="text-center">Leonardo: LeoLodi@outlook.com, +39 349 911 9941;</p>
    </div>
  </AppLayout>
</template>


<style scoped>
.conctact {
  padding: 2rem;
  text-align: center;
  font-size: 1.5rem;
  color: #333;
}
</style>
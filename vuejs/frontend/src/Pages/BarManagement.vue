<script setup>
// Carico bar — pagina full-screen per staff bar (pro) e staff cucina (starter).
// Owner/gestione accedono allo stesso pannello via il bottone dentro la tab
// Bevande del MenuSetter (modal mode).

import { onMounted } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import BarShiftPanel from '@/components/BarShiftPanel.vue';

onMounted(() => {
  document.title = 'Carico bar · Tavolo';
});
</script>

<template>
  <AppLayout page-title="Carico bar">
    <BarShiftPanel mode="page" />
  </AppLayout>
</template>

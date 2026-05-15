<script setup>
// MobileDrawer: overlay + slide-in del drawer mobile.
// Riusa AppSidebar (mode='drawer') così il contenuto della navigazione è
// definito in un solo posto e non drifta tra desktop e mobile.
//
// Chiusura su: click backdrop, Esc, cambio route, evento close di AppSidebar.
//
// Mount: l'AppLayout mette questo dentro <TeleportCompat to="body"> per
// evitare problemi di stacking context.

import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppSidebar from '@/components/AppSidebar.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  username: { type: String, default: '' },
  restaurantName: { type: String, default: '' },
  restaurantSub: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  activeOrdersCount: { type: Number, default: 0 },
  user: { type: Object, default: null },
});

// Vue 2.7-friendly: niente v-model:open con argomenti, usiamo update:open.
const emit = defineEmits(['update:open']);

const close = () => emit('update:open', false);

const onKeydown = (e) => {
  if (e.key === 'Escape' && props.open) {
    e.preventDefault();
    close();
  }
};

const route = useRoute();
// Cambio route → chiudi.
watch(() => route.fullPath, () => {
  if (props.open) close();
});

// Lock body scroll quando aperto (evita scroll sotto il drawer).
let savedOverflow = '';
watch(() => props.open, (v) => {
  if (typeof document === 'undefined') return;
  if (v) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = savedOverflow;
  }
});

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (typeof document !== 'undefined') document.body.style.overflow = savedOverflow;
});
</script>

<template>
  <Transition name="mobile-drawer">
    <div v-if="open" class="mobile-drawer-root" role="dialog" aria-modal="true" aria-label="Menu di navigazione">
      <div class="mobile-drawer-backdrop" @click="close"></div>
      <div class="mobile-drawer-panel">
        <AppSidebar
          mode="drawer"
          :username="username"
          :restaurant-name="restaurantName"
          :restaurant-sub="restaurantSub"
          :pending-count="pendingCount"
          :active-orders-count="activeOrdersCount"
          :user="user"
          @close="close"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mobile-drawer-root {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
}
.mobile-drawer-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in oklab, black 40%, transparent);
  z-index: 0;
}
.mobile-drawer-panel {
  position: relative;
  z-index: 1;
  width: 280px;
  max-width: 86%;
  height: 100%;
  background: var(--paper);
  border-right: 1px solid var(--line);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mobile-drawer-enter-active, .mobile-drawer-leave-active {
  transition: opacity 200ms ease;
}
.mobile-drawer-enter-active .mobile-drawer-panel,
.mobile-drawer-leave-active .mobile-drawer-panel {
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mobile-drawer-enter-from, .mobile-drawer-leave-to { opacity: 0; }
.mobile-drawer-enter-from .mobile-drawer-panel,
.mobile-drawer-leave-to .mobile-drawer-panel { transform: translateX(-100%); }

@media (min-width: 861px) {
  .mobile-drawer-root { display: none; }
}
</style>

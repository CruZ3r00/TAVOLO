<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { canSeeNavItem } from '@/staffAccess';

const props = defineProps({
  pendingCount: { type: Number, default: 0 },
  activeOrdersCount: { type: Number, default: 0 },
  user: { type: Object, default: null },
});

const route = useRoute();

const items = computed(() => [
  { id: 'manager', icon: 'bi-house', iconActive: 'bi-house-fill', label: 'Home', path: '/dashboard' },
  { id: 'sala', icon: 'bi-grid-3x3-gap', iconActive: 'bi-grid-3x3-gap-fill', label: 'Sala', path: '/orders', badge: props.activeOrdersCount },
  { id: 'cucina', icon: 'bi-fire', iconActive: 'bi-fire', label: 'Cucina', path: '/kitchen', accent: true },
  { id: 'prenotazioni', icon: 'bi-calendar-check', iconActive: 'bi-calendar-check-fill', label: 'Prenota', path: '/reservations', badge: props.pendingCount },
  { id: 'menu', icon: 'bi-journal', iconActive: 'bi-journal-text', label: 'Menu', path: '/menu-handler' },
].filter((item) => canSeeNavItem(props.user, item.id)));

const activeKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/kitchen')) return 'cucina';
  if (p.startsWith('/orders')) return 'sala';
  if (p.startsWith('/reservations')) return 'prenotazioni';
  if (p.startsWith('/menu-handler')) return 'menu';
  if (p.startsWith('/dashboard')) return 'manager';
  return '';
});
</script>

<template>
  <nav class="tv-mobile-nav" role="navigation" aria-label="Menu principale">
    <router-link
      v-for="it in items"
      :key="it.id"
      :to="it.path"
      class="tv-mobile-nav-item"
      :class="{ active: activeKey === it.id }"
    >
      <span class="tv-mobile-nav-icon">
        <i :class="['bi', activeKey === it.id ? it.iconActive : it.icon]" aria-hidden="true"></i>
        <span v-if="it.badge && it.badge > 0" class="tv-mobile-nav-badge" :class="{ ac: it.accent }">
          {{ it.badge > 9 ? '9+' : it.badge }}
        </span>
      </span>
      <span class="tv-mobile-nav-label">{{ it.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps({
  username: { type: String, default: '' },
  restaurantName: { type: String, default: 'Tavolo' },
  restaurantSub: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  activeOrdersCount: { type: Number, default: 0 },
  posOnline: { type: Boolean, default: false },
});

const route = useRoute();

const roles = computed(() => [
  { id: 'manager', icon: 'bi-speedometer2', label: 'Manager', path: '/dashboard' },
  { id: 'sala', icon: 'bi-grid-3x3-gap', label: 'Sala', path: '/orders', badge: props.activeOrdersCount },
  { id: 'cucina', icon: 'bi-fire', label: 'Cucina', path: '/kitchen', accent: true },
  { id: 'prenotazioni', icon: 'bi-calendar-check', label: 'Prenotazioni', path: '/reservations', badge: props.pendingCount },
  { id: 'menu', icon: 'bi-journal-text', label: 'Menu', path: '/menu-handler' },
]);

const sysItems = computed(() => [
  { id: 'sito', icon: 'bi-globe2', label: 'Sito pubblico', path: '/profile/show?section=sito' },
]);

const activeKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/kitchen')) return 'cucina';
  if (p.startsWith('/orders')) return 'sala';
  if (p.startsWith('/reservations')) return 'prenotazioni';
  if (p.startsWith('/menu-handler')) return 'menu';
  if (p.startsWith('/profile')) {
    if (route.query.section === 'sito') return 'sito';
    return 'profilo';
  }
  if (p.startsWith('/dashboard')) return 'manager';
  return '';
});

const userInitial = computed(() => (props.username || 'U').charAt(0).toUpperCase());
</script>

<template>
  <aside class="md-side">
    <div class="md-side-brand">
      <span class="tv-brand-mark">T</span>
      <div>
        <div class="md-side-name">Tavolo</div>
        <div class="md-side-sub">Gestionale</div>
      </div>
    </div>

    <div class="md-side-section">RUOLI</div>
    <router-link
      v-for="r in roles"
      :key="r.id"
      :to="r.path"
      class="md-side-item"
      :class="{ active: activeKey === r.id }"
    >
      <i :class="['bi', r.icon]" aria-hidden="true"></i>
      <span>{{ r.label }}</span>
      <span v-if="r.badge && r.badge > 0" class="md-side-badge" :class="{ ac: r.accent }">
        {{ r.badge > 99 ? '99+' : r.badge }}
      </span>
    </router-link>

    <div class="md-side-section mt">SISTEMA</div>
    <router-link
      v-for="it in sysItems"
      :key="it.id"
      :to="it.path"
      class="md-side-item"
      :class="{ active: activeKey === it.id }"
    >
      <i :class="['bi', it.icon]" aria-hidden="true"></i>
      <span>{{ it.label }}</span>
      <span v-if="it.id === 'sito' && posOnline" class="md-side-dot"></span>
    </router-link>

    <div class="md-side-foot">
      <router-link
        to="/profile/show"
        class="md-side-user"
        :class="{ active: activeKey === 'profilo' }"
        title="Apri profilo e impostazioni"
      >
        <div class="md-side-avatar">{{ userInitial }}</div>
        <div class="md-side-user-info">
          <div class="md-side-uname">{{ restaurantName }}</div>
          <div class="md-side-sub">{{ restaurantSub || username || 'Operatore' }}</div>
        </div>
        <i class="bi bi-gear md-side-user-cta" aria-hidden="true"></i>
      </router-link>
    </div>
  </aside>
</template>

<style scoped>
.md-side-user-info { flex: 1; min-width: 0; }
.md-side-user-info .md-side-uname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-side-user-info .md-side-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-side-user-cta {
  margin-left: 8px;
  color: var(--ink-3);
  font-size: 14px;
  flex-shrink: 0;
}
.md-side-user.active { background: var(--bg-sunk, var(--bg-2)); border-radius: 8px; }
.md-side-user.active .md-side-user-cta { color: var(--ac); }
</style>

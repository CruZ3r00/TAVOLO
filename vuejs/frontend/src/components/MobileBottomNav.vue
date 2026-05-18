<script setup>
// MobileBottomNav: barra di navigazione fissa in basso, visibile SOLO su
// mobile (<= 860px). Su desktop sempre nascosta.
//
// 5 macro-schede principali (filtrate per ruolo).
// Profilo / Impostazioni / Esci NON sono qui — accessibili dall'avatar
// nella MobileTopBar (dropdown).

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { STAFF_ROLES, canSeeNavItem, defaultRouteForUser, staffRole } from '@/staffAccess';

const props = defineProps({
  pendingCount: { type: Number, default: 0 },
  activeOrdersCount: { type: Number, default: 0 },
  user: { type: Object, default: null },
});

const route = useRoute();
const router = useRouter();
const role = computed(() => staffRole(props.user));
const isOwnerOrGestione = computed(
  () => role.value === STAFF_ROLES.OWNER || role.value === STAFF_ROLES.GESTIONE,
);

// Costruzione voci per ruolo. Max 5 macro-schede principali.
const items = computed(() => {
  const homePath = defaultRouteForUser(props.user) || '/dashboard';

  if (isOwnerOrGestione.value) {
    return [
      { id: 'manager', icon: 'bi-house', iconActive: 'bi-house-fill', label: 'Home', path: homePath },
      { id: 'menu', icon: 'bi-journal', iconActive: 'bi-journal-text', label: 'Menu', path: '/menu-handler' },
      { id: 'sala', icon: 'bi-grid-3x3-gap', iconActive: 'bi-grid-3x3-gap-fill', label: 'Sala', path: '/orders' },
      { id: 'ordini', icon: 'bi-receipt', iconActive: 'bi-receipt-cutoff', label: 'Ordini', path: '/kitchen', badge: props.activeOrdersCount },
      { id: 'prenotazioni', icon: 'bi-calendar-check', iconActive: 'bi-calendar-check-fill', label: 'Prenota', path: '/reservations', badge: props.pendingCount },
    ];
  }

  if (role.value === STAFF_ROLES.CAMERIERE) {
    // No "Home": per il cameriere la home coincide con /orders, quindi il
    // bottone non navigherebbe da nessuna parte.
    return [
      { id: 'sala', icon: 'bi-grid-3x3-gap', iconActive: 'bi-grid-3x3-gap-fill', label: 'Sala', path: '/orders' },
      { id: 'prenotazioni', icon: 'bi-calendar-check', iconActive: 'bi-calendar-check-fill', label: 'Prenota', path: '/reservations', badge: props.pendingCount },
    ];
  }

  // Staff di reparto: reparto + carico bar (se applicabile). Niente "Home":
  // la home coincide con la stessa pagina di reparto, quindi il bottone non
  // navigherebbe da nessuna parte.
  const dept = (() => {
    if (role.value === STAFF_ROLES.CUCINA) return { id: 'cucina', icon: 'bi-fire', label: 'Cucina', path: '/kitchen' };
    if (role.value === STAFF_ROLES.BAR) return { id: 'bar', icon: 'bi-cup-straw', label: 'Bar', path: '/bar' };
    if (role.value === STAFF_ROLES.PIZZERIA) return { id: 'pizzeria', icon: 'bi-record-circle', label: 'Pizza', path: '/pizzeria' };
    if (role.value === STAFF_ROLES.CUCINA_SG) return { id: 'cucina_sg', icon: 'bi-shield-check', label: 'SG', path: '/kitchen-sg' };
    return null;
  })();

  const out = [];
  if (dept) out.push({ ...dept, iconActive: dept.icon });
  if (canSeeNavItem(props.user, 'bar-management')) {
    out.push({ id: 'bar-management', icon: 'bi-cup-hot', iconActive: 'bi-cup-hot-fill', label: 'Carico', path: '/bar-management' });
  }
  return out;
});

const activeKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/bar-management')) return 'bar-management';
  if (p.startsWith('/kitchen-sg')) return isOwnerOrGestione.value ? 'ordini' : 'cucina_sg';
  if (p.startsWith('/kitchen')) return isOwnerOrGestione.value ? 'ordini' : 'cucina';
  if (p === '/bar' || p.startsWith('/bar/')) return 'bar';
  if (p.startsWith('/pizzeria')) return 'pizzeria';
  if (p.startsWith('/orders')) return 'sala';
  if (p.startsWith('/reservations')) return 'prenotazioni';
  if (p.startsWith('/menu-handler')) return 'menu';
  if (p.startsWith('/dashboard')) return 'manager';
  return '';
});

const onItemClick = (it) => {
  if (it.path) router.push(it.path);
};

const showBadge = (n) => Number.isFinite(Number(n)) && Number(n) > 0;
const formatBadge = (n) => (Number(n) > 9 ? '9+' : String(n));
</script>

<template>
  <nav class="mb-nav" role="navigation" aria-label="Menu principale">
    <button
      v-for="it in items"
      :key="it.id"
      type="button"
      class="mb-item"
      :class="{ 'is-active': activeKey === it.id }"
      :aria-current="activeKey === it.id ? 'page' : null"
      @click="onItemClick(it)"
    >
      <span class="mb-item-icon-wrap">
        <i :class="['bi', activeKey === it.id ? it.iconActive : it.icon]" aria-hidden="true"></i>
        <span v-if="showBadge(it.badge)" class="mb-item-badge">{{ formatBadge(it.badge) }}</span>
      </span>
      <span class="mb-item-label">{{ it.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mb-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 72px;
  background: var(--paper);
  border-top: 1px solid var(--line);
  display: flex;
  align-items: flex-start;
  justify-content: space-around;
  padding: 8px 0 18px;
  padding-bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30;
  font-family: var(--f-sans);
}

.mb-item {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--ink-3);
  font-family: inherit;
  font-weight: 500;
  position: relative;
  padding: 6px 8px 0;
  flex: 1;
  min-width: 0;
  transition: color var(--dur-fast);
}
.mb-item:hover { color: var(--ink-2); }

.mb-item-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mb-item i { font-size: 19px; line-height: 1; }
.mb-item-label { font-size: 10px; }

.mb-item.is-active { color: var(--ink); font-weight: 600; }
.mb-item.is-active::before {
  content: "";
  position: absolute;
  top: 0;
  width: 24px;
  height: 2px;
  background: var(--ink);
  border-radius: 2px;
}

.mb-item-badge {
  position: absolute;
  top: -4px;
  right: -10px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ac);
  color: var(--ac-contrast, var(--bg));
  font-family: var(--f-mono);
  font-size: 9px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: grid;
  place-items: center;
  line-height: 1;
}

@media (min-width: 861px) {
  .mb-nav { display: none; }
}
</style>

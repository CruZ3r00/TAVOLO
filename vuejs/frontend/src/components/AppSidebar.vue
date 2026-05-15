<script setup>
// AppSidebar: navigazione globale dell'app (desktop) e contenuto del drawer
// mobile (riusato da MobileDrawer.vue).
//
// Composizione (top → bottom):
// 1. Restaurant switcher (icon + nome + piano + chevron) — placeholder
//    multi-location futura.
// 2. Gruppi: Operazioni / Reparti / Gestione, ognuno filtrato per ruolo via
//    canSeeNavItem; gruppi con 0 voci vengono nascosti del tutto.
// 3. Footer: card piano + CTA "Gestisci abbonamento".

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { STAFF_ROLES, canSeeNavItem, staffRole } from '@/staffAccess';
import NavItem from '@/components/NavItem.vue';

const props = defineProps({
  username: { type: String, default: '' },
  restaurantName: { type: String, default: 'ComforTables' },
  restaurantSub: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  activeOrdersCount: { type: Number, default: 0 },
  user: { type: Object, default: null },
  // mode 'sidebar' | 'drawer' — il drawer aggiunge un header con close + bg paper
  mode: { type: String, default: 'sidebar' },
});

defineEmits(['close']);

const route = useRoute();
const role = computed(() => staffRole(props.user));
const isOwnerOrGestione = computed(() =>
  role.value === STAFF_ROLES.OWNER || role.value === STAFF_ROLES.GESTIONE,
);

const planLabel = computed(() => {
  const p = String(props.user?.subscription_plan || 'starter').toLowerCase();
  if (p === 'pro') return 'PRO';
  if (p === 'starter') return 'STARTER';
  return p.toUpperCase() || 'STARTER';
});
const isPro = computed(() => String(props.user?.subscription_plan || '').toLowerCase() === 'pro');

const restaurantInitial = computed(() => {
  const n = String(props.restaurantName || 'C').trim();
  return (n.charAt(0) || 'C').toUpperCase();
});

// id → visibile per ruolo (extends canSeeNavItem con id mancanti).
const canSee = (id) => {
  // Voci aggiuntive non in canSeeNavItem: impostazioni.
  if (id === 'impostazioni') return isOwnerOrGestione.value;
  return canSeeNavItem(props.user, id);
};

// Gruppo "Operazioni": Dashboard / Sala / Ordini / Menu.
// "Ordini" qui = Sala/Ordini per cameriere; per cucina/bar/pizzeria è il
// proprio reparto (passato sotto in "Reparti").
const groupOperazioni = computed(() => {
  const items = [
    { id: 'manager', icon: 'bi-speedometer2', label: 'Dashboard', path: '/dashboard', shortcut: 'D' },
    { id: 'sala', icon: 'bi-grid-3x3-gap', label: 'Sala', path: '/orders', shortcut: 'S', badge: props.pendingCount },
    { id: 'ordini', icon: 'bi-receipt', label: 'Ordini', path: '/kitchen', shortcut: 'O', badge: props.activeOrdersCount, badgeColor: 'var(--ac)' },
    { id: 'menu', icon: 'bi-journal-text', label: 'Menu', path: '/menu-handler', shortcut: 'M' },
    { id: 'prenotazioni', icon: 'bi-calendar-check', label: 'Prenotazioni', path: '/reservations', badge: props.pendingCount },
  ];
  return items.filter((it) => canSee(it.id));
});

// Gruppo "Reparti": cucina, bar, pizzeria, cucina_sg, bar-management.
// Owner/gestione vedono tutti, altri vedono solo il proprio.
const groupReparti = computed(() => {
  const items = [
    { id: 'cucina', icon: 'bi-fire', label: 'Cucina', path: '/kitchen' },
    { id: 'bar', icon: 'bi-cup-straw', label: 'Bar', path: '/bar' },
    { id: 'pizzeria', icon: 'bi-record-circle', label: 'Pizzeria', path: '/pizzeria', pro: !isPro.value },
    { id: 'cucina_sg', icon: 'bi-shield-check', label: 'Cucina SG', path: '/kitchen-sg', pro: !isPro.value },
    { id: 'bar-management', icon: 'bi-cup-hot', label: 'Carico bar', path: '/bar-management' },
  ];
  // Per owner/gestione mostriamo SOLO se NON sono già nella tab "Sala/Ordini"
  // — owner/gestione gestiscono ordini dalla pagina Ordini, non dai reparti.
  // Quindi per owner/gestione il gruppo Reparti è nascosto.
  if (isOwnerOrGestione.value) return items.filter((it) => it.id === 'bar-management' && canSee(it.id));
  return items.filter((it) => canSee(it.id));
});

// Gruppo "Gestione": solo Impostazioni — owner+gestione only.
// (Staff / Statistiche / footer plan card rimossi su richiesta utente.)
const groupGestione = computed(() => {
  const items = [
    { id: 'impostazioni', icon: 'bi-gear', label: 'Impostazioni', path: '/profile/show' },
  ];
  return items.filter((it) => canSee(it.id));
});

// Determina quale id è attivo dal path corrente. Mappa esplicita: il NavItem
// usa `active-class="is-active"` (router-link) ma il match di vue-router non
// è abbastanza fine per noi (due voci con path /dashboard, /reservations).
// Forziamo manualmente.
const activeKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/bar-management')) return 'bar-management';
  if (p.startsWith('/kitchen-sg')) return 'cucina_sg';
  if (p.startsWith('/kitchen')) {
    // Per owner/gestione, /kitchen è sotto "Ordini" (gruppo Operazioni).
    return isOwnerOrGestione.value ? 'ordini' : 'cucina';
  }
  if (p === '/bar' || p.startsWith('/bar/')) return 'bar';
  if (p.startsWith('/pizzeria')) return 'pizzeria';
  if (p.startsWith('/orders')) return 'sala';
  if (p.startsWith('/reservations')) return 'prenotazioni';
  if (p.startsWith('/menu-handler')) return 'menu';
  if (p.startsWith('/profile')) return 'impostazioni';
  if (p.startsWith('/dashboard')) return 'manager';
  return '';
});
</script>

<template>
  <aside class="app-sidebar" :class="{ 'app-sidebar--drawer': mode === 'drawer' }">
    <header v-if="mode === 'drawer'" class="app-sidebar-drawer-head">
      <span class="app-sidebar-drawer-mark">{{ restaurantInitial }}</span>
      <div class="app-sidebar-drawer-info">
        <div class="app-sidebar-drawer-name">{{ restaurantName }}</div>
        <div class="app-sidebar-drawer-plan">Piano {{ planLabel }}</div>
      </div>
      <button type="button" class="app-sidebar-drawer-close" aria-label="Chiudi" @click="$emit('close')">
        <i class="bi bi-x-lg"></i>
      </button>
    </header>

    <button v-else type="button" class="nav-restaurant-switcher" :title="`Piano ${planLabel}`">
      <span class="nav-restaurant-mark">{{ restaurantInitial }}</span>
      <div class="nav-restaurant-info">
        <div class="nav-restaurant-name">{{ restaurantName }}</div>
        <div class="nav-restaurant-meta">Piano {{ planLabel }}</div>
      </div>
      <i class="bi bi-chevron-down nav-restaurant-chev" aria-hidden="true"></i>
    </button>

    <div v-if="groupOperazioni.length > 0" class="nav-group">
      <div class="nav-group-title">Operazioni</div>
      <NavItem
        v-for="it in groupOperazioni"
        :key="it.id"
        :to="it.path"
        :icon="it.icon"
        :label="it.label"
        :badge="it.badge"
        :badge-color="it.badgeColor"
        :shortcut="it.shortcut"
        :active="activeKey === it.id"
        @click="$emit('close')"
      />
    </div>

    <div v-if="groupReparti.length > 0" class="nav-group">
      <div class="nav-group-title">Reparti</div>
      <NavItem
        v-for="it in groupReparti"
        :key="it.id"
        :to="it.path"
        :icon="it.icon"
        :label="it.label"
        :pro="it.pro"
        :active="activeKey === it.id"
        @click="$emit('close')"
      />
    </div>

    <div v-if="groupGestione.length > 0" class="nav-group">
      <div class="nav-group-title">Gestione</div>
      <NavItem
        v-for="it in groupGestione"
        :key="it.id"
        :to="it.path"
        :icon="it.icon"
        :label="it.label"
        :pro="it.pro"
        :active="activeKey === it.id"
        @click="$emit('close')"
      />
    </div>

    <div class="app-sidebar-spacer"></div>

    <NavItem
      v-if="canSeeNavItem(user, 'logout')"
      to="/logout"
      icon="bi-box-arrow-right"
      label="Esci"
      :danger="true"
      @click="$emit('close')"
    />
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--line);
  background: var(--bg-sunk);
  padding: var(--s-5, 20px) var(--s-3, 12px) var(--s-4, 16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  position: sticky;
  top: 56px;
  height: calc(100vh - 56px);
  font-family: var(--f-sans);
}

.app-sidebar--drawer {
  position: relative;
  top: 0;
  height: 100%;
  background: var(--paper);
  border-right: 1px solid var(--line);
  width: 100%;
  padding: 14px 12px;
}

.app-sidebar-drawer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 14px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 8px;
  flex-shrink: 0;
}
.app-sidebar-drawer-mark {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--bg);
  display: grid; place-items: center;
  font-weight: 700; font-size: 14px;
  flex-shrink: 0;
}
.app-sidebar-drawer-info { flex: 1; min-width: 0; }
.app-sidebar-drawer-name {
  font-size: 14px; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.app-sidebar-drawer-plan {
  font-size: 11px; color: var(--ink-3);
  font-family: var(--f-mono); letter-spacing: 0.05em;
}
.app-sidebar-drawer-close {
  appearance: none;
  background: transparent;
  border: none;
  width: 34px; height: 34px;
  border-radius: 8px;
  display: grid; place-items: center;
  cursor: pointer;
  color: var(--ink-2);
  transition: background var(--dur-fast);
}
.app-sidebar-drawer-close:hover { background: var(--bg-hover); color: var(--ink); }

.nav-restaurant-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.nav-restaurant-switcher:hover { background: var(--bg-elev); border-color: var(--line-strong); }
.nav-restaurant-mark {
  width: 28px; height: 28px;
  border-radius: 7px;
  background: var(--ink);
  color: var(--bg);
  display: grid; place-items: center;
  font-weight: 700; font-size: 12px;
  flex-shrink: 0;
}
.nav-restaurant-info { flex: 1; min-width: 0; }
.nav-restaurant-name {
  font-size: 13px; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nav-restaurant-meta {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--f-mono);
  letter-spacing: 0.04em;
}
.nav-restaurant-chev { color: var(--ink-3); font-size: 12px; flex-shrink: 0; }

.nav-group { display: flex; flex-direction: column; gap: 1px; }
.nav-group + .nav-group { margin-top: 8px; }

.nav-group-title {
  padding: 12px 12px 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}

.app-sidebar-spacer { flex: 1; min-height: 12px; }

@media (max-width: 860px) {
  /* Sidebar è completamente nascosta su mobile (drawer la sostituisce). */
  .app-sidebar:not(.app-sidebar--drawer) { display: none; }
}
</style>

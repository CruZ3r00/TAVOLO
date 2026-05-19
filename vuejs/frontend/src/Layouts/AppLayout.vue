<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { fetchReservations, fetchOrders } from '@/utils';
import { isSupabaseRealtimeConfigured, supabase } from '@/supabase';
import { STAFF_ROLES, canSeeNavItem, defaultRouteForUser, effectiveUserId, kitchenRoleLabel, staffRole } from '@/staffAccess';
import MobileBottomNav from '@/components/MobileBottomNav.vue';
import MobileTopBar from '@/components/MobileTopBar.vue';
import AlertHeaderBar from '@/components/AlertHeaderBar.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import TeleportCompat from '@/lib/compat/teleport.js';
import CommandPalette from '@/components/CommandPalette.vue';

const props = defineProps({
  // 'app' = sidebar + bottom nav, 'public' = top nav, 'auto' = decide da auth + path
  variant: { type: String, default: 'auto' },
  pageTitle: { type: String, default: '' },
});

const username = ref('');
const restaurantName = ref('ComforTables');
const restaurantSub = ref('');
const store = useStore();
const route = useRoute();
const isLoggedIn = computed(() => store.getters.isAuthenticated);
const mobileMenuOpen = ref(false); // mobile-nav-panel del public variant (landing/auth hamburger). L'app variant non usa più drawer.
const userMenuOpen = ref(false);
const pendingCount = ref(0);
const activeOrdersCount = ref(0);
const paletteRef = ref(null);
let pollId = null;
let realtimeChannel = null;
let realtimeRefreshHandle = null;

const notificationCount = computed(() => Number(pendingCount.value || 0) + Number(activeOrdersCount.value || 0));
const hasNotifications = computed(() => notificationCount.value > 0);
const formatNotificationBadge = (n) => (n > 9 ? '9+' : String(n));

const openPalette = () => {
  // CommandPalette espone `open` via defineExpose. È mounted via TeleportCompat
  // a body, quindi il ref è valido subito.
  paletteRef.value?.open?.();
};

const applyUserToDisplay = (userData) => {
  if (!userData) return;
  username.value = userData.username || '';
  restaurantName.value = userData.restaurant_name || userData.username || 'ComforTables';
  const city = userData.city || userData.address || '';
  const tables = userData.coperti_invernali ? `${userData.coperti_invernali} coperti` : '';
  restaurantSub.value = [city, tables].filter(Boolean).join(' · ') || 'Gestionale';
};

const checkLog = async () => {
  if (!isLoggedIn.value) return;
  // refreshUser fa fetch /api/users/me e committa al store cosi' campi come
  // subscription_plan restano allineati al backend (fix: pro che vedeva il
  // Magazzino bloccato perche' lo user in localStorage era pre-upgrade).
  await store.dispatch('refreshUser');
  applyUserToDisplay(store.getters.getUser);
};

const refreshCounts = async () => {
  if (!store.getters.isAuthenticated) return;
  const token = store.getters.getToken;
  if (!token) return;
  try {
    const canReadReservations = showNav('prenotazioni');
    const [r, o] = await Promise.all([
      canReadReservations
        ? fetchReservations({ status: 'pending', pageSize: 1 }, token)
        : Promise.resolve(null),
      fetchOrders({ status: 'active', service_type: 'table', pageSize: 1 }, token),
    ]);
    pendingCount.value = canReadReservations ? (r?.meta?.pagination?.total ?? 0) : 0;
    activeOrdersCount.value = o?.meta?.pagination?.total ?? 0;
  } catch (_err) { /* silent */ }
};

const scheduleRealtimeCountsRefresh = () => {
  if (document.visibilityState !== 'visible') return;
  if (realtimeRefreshHandle) clearTimeout(realtimeRefreshHandle);
  realtimeRefreshHandle = setTimeout(() => {
    realtimeRefreshHandle = null;
    refreshCounts();
  }, 300);
};

const stopRealtimeCounts = async () => {
  if (realtimeRefreshHandle) {
    clearTimeout(realtimeRefreshHandle);
    realtimeRefreshHandle = null;
  }
  if (realtimeChannel && supabase) {
    try {
      await supabase.removeChannel(realtimeChannel);
    } catch (_err) { /* realtime is optional */ }
    realtimeChannel = null;
  }
};

const subscribeRealtimeCounts = async () => {
  await stopRealtimeCounts();
  const userId = effectiveUserId(store.getters.getUser);
  if (!isSupabaseRealtimeConfigured || !supabase || !userId) return;
  try {
    realtimeChannel = supabase
      .channel(`app-counts-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_realtime_events',
        filter: `user_id=eq.${userId}`,
      }, scheduleRealtimeCountsRefresh);

    realtimeChannel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeChannel = null;
      }
    });
  } catch (_err) {
    realtimeChannel = null;
  }
};

const variantResolved = computed(() => {
  if (props.variant !== 'auto') return props.variant;
  return isLoggedIn.value ? 'app' : 'public';
});
// Computed esplicito: il compiler-sfc Vue 2.7 a volte ottimizza-out i nodi
// con `v-if="isGuest"` adiacenti a `v-if="isLoggedIn"`, scartandoli dal
// render output. Usare un nome diverso evita l'ottimizzazione errata.
const isGuest = computed(() => !isLoggedIn.value);

const userInitial = computed(() => (username.value || 'U').charAt(0).toUpperCase());
const currentUser = computed(() => store.getters.getUser || null);
const defaultAppRoute = computed(() => defaultRouteForUser(currentUser.value));
const showNav = (id) => canSeeNavItem(currentUser.value, id);
const showMobileProfile = computed(() => showNav('profilo'));

// Global navigation items mostrati come pills nella sub-navbar orizzontale
// (desktop). Su mobile la stessa nav è disponibile via drawer (AppSidebar).
const userRole = computed(() => staffRole(currentUser.value));
const isOwnerOrGestione = computed(
  () => userRole.value === STAFF_ROLES.OWNER || userRole.value === STAFF_ROLES.GESTIONE,
);

const globalNavItems = computed(() => {
  if (isOwnerOrGestione.value) {
    return [
      { id: 'manager', icon: 'bi-speedometer2', label: 'Dashboard', path: '/dashboard' },
      { id: 'sala', icon: 'bi-grid-3x3-gap', label: 'Sala', path: '/orders', badge: pendingCount.value },
      { id: 'ordini', icon: 'bi-receipt', label: 'Ordini', path: '/kitchen', badge: activeOrdersCount.value, badgeAccent: true },
      { id: 'menu', icon: 'bi-journal-text', label: 'Menu', path: '/menu-handler' },
      { id: 'prenotazioni', icon: 'bi-calendar-check', label: 'Prenotazioni', path: '/reservations', badge: pendingCount.value },
    ].filter((it) => showNav(it.id));
  }

  // Staff (cameriere / cucina / bar / pizzeria / cucina_sg): vedono solo
  // le voci legate al loro ruolo + carico bar quando applicabile.
  return [
    { id: 'sala', icon: 'bi-grid-3x3-gap', label: 'Sala', path: '/orders', badge: pendingCount.value },
    { id: 'cucina', icon: 'bi-fire', label: kitchenRoleLabel(currentUser.value), path: '/kitchen' },
    { id: 'bar', icon: 'bi-cup-straw', label: 'Bar', path: '/bar' },
    { id: 'pizzeria', icon: 'bi-record-circle', label: 'Pizzeria', path: '/pizzeria' },
    { id: 'cucina_sg', icon: 'bi-shield-check', label: 'Cucina SG', path: '/kitchen-sg' },
    { id: 'bar-management', icon: 'bi-cup-hot', label: 'Carico bar', path: '/bar-management' },
    { id: 'prenotazioni', icon: 'bi-calendar-check', label: 'Prenotazioni', path: '/reservations', badge: pendingCount.value },
  ].filter((it) => showNav(it.id));
});

const activeNavKey = computed(() => {
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

const showBadge = (n) => Number.isFinite(Number(n)) && Number(n) > 0;
const formatBadge = (n) => (Number(n) > 9 ? '9+' : String(n));

const handleClickOutside = (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('.user-menu')) userMenuOpen.value = false;
};

onMounted(async () => {
  await checkLog();
  if (isLoggedIn.value) {
    await refreshCounts();
    await subscribeRealtimeCounts();
    pollId = setInterval(refreshCounts, 30000);
  }
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  if (pollId) clearInterval(pollId);
  stopRealtimeCounts();
  document.removeEventListener('click', handleClickOutside);
});

watch(() => route.path, () => {
  mobileMenuOpen.value = false;
  userMenuOpen.value = false;
});

const closeMobileMenu = () => { mobileMenuOpen.value = false; };
const toggleMobileMenu = () => { mobileMenuOpen.value = !mobileMenuOpen.value; };
const toggleUserMenu = () => { userMenuOpen.value = !userMenuOpen.value; };
const closeUserMenu = () => { userMenuOpen.value = false; };
</script>

<template>
  <!-- ============== APP variant: top nav + sidebar + bottom nav ============== -->
  <div v-if="variantResolved === 'app'" class="app-shell-app">
    <!-- Top nav globale (desktop) -->
    <header class="app-top-nav">
      <div class="app-top-inner">
        <router-link :to="defaultAppRoute" class="app-top-brand" aria-label="Home">
          <span class="tv-brand-mark sm">C</span>
          <span class="app-top-brand-text">comforTables</span>
        </router-link>

        <button
          type="button"
          class="app-top-search"
          @click="openPalette"
          aria-label="Cerca, naviga, esegui un'azione"
        >
          <i class="bi bi-search" aria-hidden="true"></i>
          <span class="app-top-search-text">Cerca, naviga, esegui un'azione…</span>
          <span class="app-top-search-kbds">
            <kbd>⌘</kbd><kbd>K</kbd>
          </span>
        </button>

        <div class="app-top-tools">
          <ThemeToggle compact class="app-top-theme" />
          <router-link
            v-if="hasNotifications"
            to="/reservations"
            class="app-top-icon-btn app-top-icon-btn--badged"
            :aria-label="`Notifiche (${notificationCount})`"
          >
            <i class="bi bi-bell" aria-hidden="true"></i>
            <span class="app-top-bell-badge">{{ formatNotificationBadge(notificationCount) }}</span>
          </router-link>
          <button
            v-else
            type="button"
            class="app-top-icon-btn"
            aria-label="Notifiche"
            disabled
          >
            <i class="bi bi-bell" aria-hidden="true"></i>
          </button>

          <div class="user-menu">
            <button
              type="button"
              class="app-top-avatar"
              :aria-expanded="userMenuOpen"
              aria-label="Menu utente"
              @click.stop="toggleUserMenu"
            >
              <span>{{ userInitial }}</span>
            </button>
            <Transition name="fade">
              <ul v-if="userMenuOpen" class="user-dropdown" role="menu">
                <li class="user-dropdown-header">
                  <div class="user-dropdown-name">{{ username || 'Utente' }}</div>
                  <div class="user-dropdown-role">{{ restaurantName }}</div>
                </li>
                <li v-if="showMobileProfile">
                  <router-link to="/profile/show" class="user-dropdown-item" @click="closeUserMenu">
                    <i class="bi bi-person"></i><span>Profilo</span>
                  </router-link>
                </li>
                <li v-if="showNav('impostazioni') || isOwnerOrGestione">
                  <router-link to="/profile/show" class="user-dropdown-item" @click="closeUserMenu">
                    <i class="bi bi-gear"></i><span>Impostazioni</span>
                  </router-link>
                </li>
                <li><hr class="user-dropdown-sep"></li>
                <li>
                  <router-link to="/logout" class="user-dropdown-item user-dropdown-item--danger" @click="closeUserMenu">
                    <i class="bi bi-box-arrow-right"></i><span>Esci</span>
                  </router-link>
                </li>
              </ul>
            </Transition>
          </div>
        </div>
      </div>
    </header>

    <!-- Sub-navbar orizzontale (sostituisce la sidebar globale su desktop) -->
    <nav
      v-if="globalNavItems.length > 0"
      class="app-subnav"
      role="navigation"
      aria-label="Navigazione principale"
    >
      <div class="app-subnav-inner">
        <router-link
          v-for="it in globalNavItems"
          :key="it.id"
          :to="it.path"
          class="app-subnav-item"
          :class="{ 'is-active': activeNavKey === it.id }"
          :aria-current="activeNavKey === it.id ? 'page' : null"
        >
          <i :class="['bi', it.icon]" aria-hidden="true"></i>
          <span>{{ it.label }}</span>
          <span
            v-if="showBadge(it.badge)"
            class="app-subnav-badge"
            :class="{ 'app-subnav-badge--accent': it.badgeAccent }"
          >{{ formatBadge(it.badge) }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Mobile top bar (visibile solo <= 860px tramite media query interna) -->
    <MobileTopBar
      :title="pageTitle || 'ComforTables'"
      :username="username"
      :restaurant-name="restaurantName"
      :show-profile="showMobileProfile"
      @open-palette="openPalette"
    />

    <main class="app-shell-main">
      <AlertHeaderBar />
      <slot />
    </main>

    <MobileBottomNav
      :pending-count="pendingCount"
      :active-orders-count="activeOrdersCount"
      :user="currentUser"
    />

    <TeleportCompat to="body">
      <CommandPalette ref="paletteRef" />
    </TeleportCompat>
  </div>

  <!-- ============== PUBLIC variant: landing/auth top nav ============== -->
  <div v-else class="app-shell">
    <nav class="nav">
      <div class="nav-inner">
        <router-link :to="isLoggedIn ? defaultAppRoute : '/landing'" class="brand" @click="closeMobileMenu">
          <span class="tv-brand-mark">C</span>
          <span class="brand-text">ComforTables</span>
          <span class="brand-tag">beta</span>
        </router-link>

        <div class="public-links">
          <router-link to="/landing" class="public-link" active-class="is-active">Home</router-link>
          <router-link to="/who-are-us" class="public-link" active-class="is-active">Chi siamo</router-link>
          <router-link to="/contact-us" class="public-link" active-class="is-active">Contattaci</router-link>
        </div>

        <div class="nav-tools">
          <ThemeToggle class="nav-theme-toggle" />
          <ThemeToggle compact class="nav-theme-toggle-mobile" />
          <router-link
            v-if="isLoggedIn"
            :to="defaultAppRoute"
            class="btn btn-primary btn-sm nav-cta"
          >
            <i class="bi bi-speedometer2"></i> Vai alla dashboard
          </router-link>
          <div v-if="isLoggedIn" class="user-menu">
            <button class="avatar" @click.stop="toggleUserMenu" :aria-expanded="userMenuOpen">
              <span>{{ userInitial }}</span>
            </button>
            <Transition name="fade">
              <ul v-if="userMenuOpen" class="user-dropdown" role="menu">
                <li class="user-dropdown-header">
                  <div class="user-dropdown-name">{{ username || 'Utente' }}</div>
                  <div class="user-dropdown-role">Operatore</div>
                </li>
                <li><router-link to="/profile/show" class="user-dropdown-item" @click="closeUserMenu"><i class="bi bi-person"></i><span>Profilo</span></router-link></li>
                <li><hr class="user-dropdown-sep"></li>
                <li><router-link to="/logout" class="user-dropdown-item user-dropdown-item--danger" @click="closeUserMenu"><i class="bi bi-box-arrow-right"></i><span>Esci</span></router-link></li>
              </ul>
            </Transition>
          </div>
          <router-link v-if="isGuest" to="/login" class="btn btn-ghost btn-sm nav-cta">Accedi</router-link>
          <router-link v-if="isGuest" to="/register" class="btn btn-primary btn-sm nav-cta">Inizia ora</router-link>

          <button class="hamburger" :class="{ 'is-open': mobileMenuOpen }" @click="toggleMobileMenu" :aria-expanded="mobileMenuOpen" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <Transition name="panel">
        <div v-if="mobileMenuOpen" class="mobile-nav-panel">
          <ThemeToggle class="mobile-theme-toggle"></ThemeToggle>
          <hr class="mobile-sep">
          <router-link to="/landing" class="mobile-link" @click="closeMobileMenu">Home</router-link>
          <router-link to="/who-are-us" class="mobile-link" @click="closeMobileMenu">Chi siamo</router-link>
          <router-link to="/contact-us" class="mobile-link" @click="closeMobileMenu">Contattaci</router-link>
          <hr class="mobile-sep">
          <router-link v-if="isLoggedIn" :to="defaultAppRoute" class="mobile-link" @click="closeMobileMenu"><i class="bi bi-speedometer2"></i><span>Dashboard</span></router-link>
          <router-link v-if="isLoggedIn && showNav('profilo')" to="/profile/show" class="mobile-link" @click="closeMobileMenu"><i class="bi bi-person"></i><span>Profilo</span></router-link>
          <router-link v-if="isLoggedIn" to="/logout" class="mobile-link mobile-link--danger" @click="closeMobileMenu"><i class="bi bi-box-arrow-right"></i><span>Esci</span></router-link>
          <router-link v-if="isGuest" to="/login" class="mobile-link" @click="closeMobileMenu">Accedi</router-link>
          <router-link v-if="isGuest" to="/register" class="mobile-link mobile-link--primary" @click="closeMobileMenu">Inizia ora</router-link>
        </div>
      </Transition>
    </nav>

    <main class="main-content">
      <slot />
    </main>

    <footer class="app-footer">
      <div class="app-footer-inner">
        <div class="app-footer-brand">
          <span class="tv-brand-mark sm">C</span>
          <span>ComforTables</span>
          <span class="app-footer-tag">Il gestionale dei ristoranti moderni</span>
        </div>
        <nav class="app-footer-nav">
          <router-link to="/terms">Termini</router-link>
          <router-link to="/privacy-policy">Privacy</router-link>
          <router-link to="/contact-us">Contatti</router-link>
        </nav>
        <div class="app-footer-copy">&copy; {{ new Date().getFullYear() }} ComforTables</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============== APP variant — workspace shell ============== */
.app-shell-app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--f-sans);
}

/* ── Top nav ── */
.app-top-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in oklab, var(--bg) 78%, transparent);
  backdrop-filter: saturate(1.2) blur(10px);
  -webkit-backdrop-filter: saturate(1.2) blur(10px);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.app-top-inner {
  display: grid;
  grid-template-columns: 200px 1fr auto;
  align-items: center;
  gap: var(--s-4, 16px);
  height: 56px;
  padding: 0 var(--s-5, 20px);
  max-width: none;
}
.app-top-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--ink);
  flex-shrink: 0;
}
.app-top-brand-text {
  font-family: var(--f-sans);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.app-top-search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px 0 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  color: var(--ink-3);
  font-family: var(--f-sans);
  font-size: 13px;
  cursor: pointer;
  max-width: 540px;
  margin: 0 auto;
  width: 100%;
  transition: border-color var(--dur-fast), background var(--dur-fast);
}
.app-top-search:hover { border-color: var(--line-strong); background: var(--paper); }
.app-top-search i { font-size: 14px; }
.app-top-search-text { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-top-search-kbds { display: inline-flex; gap: 2px; flex-shrink: 0; }
.app-top-search-kbds kbd {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink-3);
}

.app-top-tools { display: flex; align-items: center; gap: 6px; }
.app-top-theme {}

.app-top-icon-btn {
  appearance: none;
  width: 34px; height: 34px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink-2);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.app-top-icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.app-top-icon-btn:disabled { color: var(--ink-3); cursor: default; opacity: 0.7; }
.app-top-icon-btn i { font-size: 16px; line-height: 1; }
.app-top-bell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ac);
  color: var(--ac-contrast, var(--bg));
  font-family: var(--f-mono);
  font-size: 9.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-grid;
  place-items: center;
  box-shadow: 0 0 0 2px var(--bg);
}
.app-top-icon-btn--badged i { color: var(--ink); }

.app-top-avatar {
  appearance: none;
  width: 32px; height: 32px;
  border: 1px solid var(--line);
  background: var(--ac-soft);
  color: var(--ac-ink);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--f-mono);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.app-top-avatar:hover { background: var(--ac); color: var(--bg); }

/* ── Sub-navbar orizzontale (sostituisce la sidebar globale su desktop) ── */
.app-subnav {
  position: sticky;
  top: 56px; /* sotto al top-nav */
  z-index: 35;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.app-subnav-inner {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 0 var(--s-5, 20px);
  height: 44px;
  max-width: none;
  overflow-x: auto;
  scrollbar-width: thin;
}
.app-subnav-inner::-webkit-scrollbar { height: 4px; }
.app-subnav-inner::-webkit-scrollbar-thumb { background: var(--line); border-radius: 2px; }

.app-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-family: var(--f-sans);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  position: relative;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.app-subnav-item:hover { color: var(--ink); background: var(--bg-hover); }
.app-subnav-item i { font-size: 14px; opacity: 0.85; }
.app-subnav-item.is-active { color: var(--ink); font-weight: 600; }
.app-subnav-item.is-active i { opacity: 1; color: var(--ac); }
.app-subnav-item.is-active::after {
  content: "";
  position: absolute;
  left: 8px; right: 8px;
  bottom: -1px;
  height: 2px;
  background: var(--ink);
  border-radius: 2px 2px 0 0;
}

.app-subnav-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-grid;
  place-items: center;
}
.app-subnav-badge--accent { background: var(--ac); color: var(--ac-contrast, var(--bg)); }

/* ── Main content area ── */
.app-shell-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Mobile: top-nav desktop e sub-navbar nascoste, MobileTopBar+BottomNav prendono il posto. */
@media (max-width: 860px) {
  .app-top-nav,
  .app-subnav { display: none; }
  .app-shell-main { padding-bottom: 96px; /* spazio per bottom nav */ }
}

/* ============== PUBLIC variant — landing/auth nav ============== */
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

.nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in oklab, var(--bg) 78%, transparent);
  backdrop-filter: saturate(1.2) blur(10px);
  -webkit-backdrop-filter: saturate(1.2) blur(10px);
  border-bottom: 1px solid var(--line);
}

.nav-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  height: 64px;
  display: flex;
  align-items: center;
  gap: var(--s-5);
}

.brand {
  display: flex; align-items: center; gap: var(--s-3);
  text-decoration: none; color: var(--ink); flex-shrink: 0;
}
.brand-text { font-family: var(--f-sans); font-size: 17px; font-weight: 600; letter-spacing: -0.025em; }
.brand-tag {
  font-family: var(--f-mono);
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ac-ink); background: var(--ac-soft);
  padding: 2px 6px; border-radius: 4px; margin-left: 2px;
}

.public-links { display: flex; gap: 28px; margin-left: 12px; }
.public-link {
  color: var(--ink-2); text-decoration: none;
  font-size: 14px; font-weight: 450;
  padding: 8px 4px; transition: color var(--dur);
}
.public-link:hover { color: var(--ink); }
.public-link.is-active { color: var(--ink); font-weight: 500; }

.nav-tools { margin-left: auto; display: flex; align-items: center; gap: var(--s-2); }
.nav-theme-toggle-mobile { display: none; }
.mobile-theme-toggle {
  align-self: flex-start;
}
.user-menu { position: relative; }
.avatar {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  background: var(--ink); color: var(--paper);
  border: none; border-radius: 999px; cursor: pointer;
  font-family: var(--f-mono); font-weight: 600; font-size: 13px;
}
.user-dropdown {
  position: absolute; top: calc(100% + 8px); right: 0;
  min-width: 220px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px; list-style: none; margin: 0; z-index: 50;
}
.user-dropdown-header { padding: 10px 12px 12px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.user-dropdown-name { font-size: 14px; font-weight: 600; color: var(--ink); }
.user-dropdown-role { font-family: var(--f-mono); font-size: 11px; color: var(--ink-3); margin-top: 2px; letter-spacing: 0.02em; }
.user-dropdown-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; font-size: 14px;
  color: var(--ink-2); text-decoration: none;
  border-radius: var(--r-sm);
  transition: background var(--dur), color var(--dur);
}
.user-dropdown-item:hover { background: var(--bg-hover); color: var(--ink); }
.user-dropdown-item--danger { color: var(--danger); }
.user-dropdown-item--danger:hover { background: color-mix(in oklab, var(--danger) 10%, transparent); }
.user-dropdown-sep { border: none; border-top: 1px solid var(--line); margin: 4px 0; }

.hamburger {
  display: none;
  width: 36px; height: 36px;
  flex-direction: column; align-items: center; justify-content: center;
  gap: 5px;
  background: none; border: none; cursor: pointer;
  border-radius: var(--r-md);
}
.hamburger span { display: block; width: 18px; height: 2px; background: var(--ink); border-radius: 999px; transition: transform 220ms, opacity 220ms; }
.hamburger.is-open span:nth-child(1) { transform: rotate(45deg) translate(4px, 5px); }
.hamburger.is-open span:nth-child(2) { opacity: 0; }
.hamburger.is-open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -5px); }

.mobile-nav-panel {
  border-top: 1px solid var(--line);
  background: var(--bg);
  padding: var(--s-3) var(--s-6) var(--s-5);
  display: flex; flex-direction: column; gap: 2px;
}
.mobile-link {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  font-size: 15px; font-weight: 500;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: var(--r-md);
}
.mobile-link i { font-size: 17px; opacity: 0.85; }
.mobile-link:hover { background: var(--bg-hover); color: var(--ink); }
.mobile-link--primary { color: var(--ac); font-weight: 600; }
.mobile-link--danger { color: var(--danger); }
.mobile-sep { border: none; border-top: 1px solid var(--line); margin: 8px 0; }

.main-content { flex: 1; background: var(--bg); }

.app-footer {
  background: var(--bg-sunk, var(--bg-2));
  border-top: 1px solid var(--line);
  padding: var(--s-7) 0;
}
.app-footer-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-5); flex-wrap: wrap;
}
.app-footer-brand { display: flex; align-items: center; gap: var(--s-2); font-weight: 600; color: var(--ink); }
.app-footer-tag { font-family: var(--f-mono); font-weight: 400; font-size: 12px; color: var(--ink-3); margin-left: var(--s-2); padding-left: var(--s-2); border-left: 1px solid var(--line); }
.app-footer-nav { display: flex; gap: var(--s-5); }
.app-footer-nav a { font-size: 14px; color: var(--ink-2); text-decoration: none; }
.app-footer-nav a:hover { color: var(--ac); }
.app-footer-copy { font-family: var(--f-mono); font-size: 12px; color: var(--ink-3); }

.fade-enter-active, .fade-leave-active { transition: opacity 140ms, transform 140ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
.panel-enter-active, .panel-leave-active { transition: max-height 280ms ease, opacity 200ms; overflow: hidden; }
.panel-enter-from, .panel-leave-to { max-height: 0; opacity: 0; }
.panel-enter-to, .panel-leave-from { max-height: 600px; opacity: 1; }

@media (max-width: 860px) {
  .public-links { display: none; }
  .hamburger { display: flex; }
  .nav-cta { display: none; }
  .nav-theme-toggle { display: none; }
  .nav-theme-toggle-mobile { display: inline-flex; }
  .brand-tag { display: none; }
  .nav-inner { padding: 0 var(--s-4); gap: var(--s-3); }
  .app-footer-inner { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>

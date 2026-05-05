<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { API_BASE, fetchReservations, fetchOrders } from '@/utils';
import { isSupabaseRealtimeConfigured, supabase } from '@/supabase';
import { canSeeNavItem, defaultRouteForUser, effectiveUserId } from '@/staffAccess';
import AppSidebar from '@/components/AppSidebar.vue';
import MobileBottomNav from '@/components/MobileBottomNav.vue';
import MobileTopBar from '@/components/MobileTopBar.vue';

const props = defineProps({
  // 'app' = sidebar + bottom nav, 'public' = top nav, 'auto' = decide da auth + path
  variant: { type: String, default: 'auto' },
  pageTitle: { type: String, default: '' },
});

const username = ref('');
const restaurantName = ref('Tavolo');
const restaurantSub = ref('');
const store = useStore();
const route = useRoute();
const isLoggedIn = computed(() => store.getters.isAuthenticated);
const mobileMenuOpen = ref(false);
const userMenuOpen = ref(false);
const pendingCount = ref(0);
const activeOrdersCount = ref(0);
let pollId = null;
let realtimeChannel = null;
let realtimeRefreshHandle = null;

const checkLog = async () => {
  if (!isLoggedIn.value) return;
  const token = store.getters.getToken;
  try {
    const response = await fetch(`${API_BASE}/api/users/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const userData = await response.json();
      username.value = userData.username;
      restaurantName.value = userData.restaurant_name || userData.username || 'Tavolo';
      const city = userData.city || userData.address || '';
      const tables = userData.coperti_invernali ? `${userData.coperti_invernali} coperti` : '';
      restaurantSub.value = [city, tables].filter(Boolean).join(' · ') || 'Gestionale';
    }
  } catch (_err) { /* silent */ }
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
      fetchOrders({ status: 'active', pageSize: 1 }, token),
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

const userInitial = computed(() => (username.value || 'U').charAt(0).toUpperCase());
const currentUser = computed(() => store.getters.getUser || null);
const defaultAppRoute = computed(() => defaultRouteForUser(currentUser.value));
const showNav = (id) => canSeeNavItem(currentUser.value, id);
const showMobileProfile = computed(() => showNav('profilo'));
const showMobileReservations = computed(() => showNav('prenotazioni'));

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
  <!-- ============== APP variant: sidebar + bottom nav ============== -->
  <div v-if="variantResolved === 'app'" class="app-shell-app">
    <MobileTopBar
      :title="pageTitle || 'Tavolo'"
      :has-notifications="pendingCount > 0"
      :username="username"
      :restaurant-name="restaurantName"
      :show-menu-button="false"
      :show-reservations="showMobileReservations"
      :show-profile="showMobileProfile"
      @menu="toggleMobileMenu"
    />

    <AppSidebar
      class="app-shell-sidebar"
      :username="username"
      :restaurant-name="restaurantName"
      :restaurant-sub="restaurantSub"
      :pending-count="pendingCount"
      :active-orders-count="activeOrdersCount"
      :user="currentUser"
    />

    <main class="app-shell-main">
      <slot />
    </main>

    <MobileBottomNav
      :pending-count="pendingCount"
      :active-orders-count="activeOrdersCount"
      :user="currentUser"
    />

    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="mobileMenuOpen" class="mobile-drawer-backdrop" @click="closeMobileMenu">
          <aside class="mobile-drawer" @click.stop>
            <header class="mobile-drawer-h">
              <span class="tv-brand-mark">T</span>
              <div>
                <div class="md-side-name">{{ restaurantName }}</div>
                <div class="md-side-sub">{{ restaurantSub }}</div>
              </div>
              <button class="fm-close" @click="closeMobileMenu" aria-label="Chiudi"><i class="bi bi-x-lg"/></button>
            </header>
            <nav class="mobile-drawer-nav">
              <router-link v-if="showNav('manager')" to="/dashboard" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-speedometer2"/> Manager</router-link>
              <router-link v-if="showNav('sala')" to="/orders" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-grid-3x3-gap"/> Sala</router-link>
              <router-link v-if="showNav('cucina')" to="/kitchen" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-fire"/> Cucina</router-link>
              <router-link v-if="showNav('prenotazioni')" to="/reservations" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-calendar-check"/> Prenotazioni</router-link>
              <router-link v-if="showNav('menu')" to="/menu-handler" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-journal-text"/> Menu</router-link>
              <hr v-if="showNav('sito') || showNav('profilo')" class="mobile-drawer-sep">
              <router-link v-if="showNav('sito')" to="/profile/show?section=sito" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-globe2"/> Sito pubblico</router-link>
              <router-link v-if="showNav('profilo')" to="/profile/show" class="md-side-item" @click="closeMobileMenu"><i class="bi bi-person"/> Profilo</router-link>
              <router-link to="/logout" class="md-side-item md-side-item--danger" @click="closeMobileMenu"><i class="bi bi-box-arrow-right"/> Esci</router-link>
            </nav>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- ============== PUBLIC variant: landing/auth top nav ============== -->
  <div v-else class="app-shell">
    <nav class="nav">
      <div class="nav-inner">
        <router-link :to="isLoggedIn ? defaultAppRoute : '/landing'" class="brand" @click="closeMobileMenu">
          <span class="tv-brand-mark">T</span>
          <span class="brand-text">Tavolo</span>
          <span class="brand-tag">beta</span>
        </router-link>

        <div class="public-links">
          <router-link to="/landing" class="public-link" active-class="is-active">Home</router-link>
          <router-link to="/who-are-us" class="public-link" active-class="is-active">Chi siamo</router-link>
          <router-link to="/contact-us" class="public-link" active-class="is-active">Contattaci</router-link>
        </div>

        <div class="nav-tools">
          <template v-if="isLoggedIn">
            <router-link :to="defaultAppRoute" class="btn btn-primary btn-sm nav-cta">
              <i class="bi bi-speedometer2"/> Vai alla dashboard
            </router-link>
            <div class="user-menu">
              <button class="avatar" @click.stop="toggleUserMenu" :aria-expanded="userMenuOpen">
                <span>{{ userInitial }}</span>
              </button>
              <Transition name="fade">
                <ul v-if="userMenuOpen" class="user-dropdown" role="menu">
                  <li class="user-dropdown-header">
                    <div class="user-dropdown-name">{{ username || 'Utente' }}</div>
                    <div class="user-dropdown-role">Operatore</div>
                  </li>
                  <li><router-link to="/profile/show" class="user-dropdown-item" @click="closeUserMenu"><i class="bi bi-person"/><span>Profilo</span></router-link></li>
                  <li><hr class="user-dropdown-sep"></li>
                  <li><router-link to="/logout" class="user-dropdown-item user-dropdown-item--danger" @click="closeUserMenu"><i class="bi bi-box-arrow-right"/><span>Esci</span></router-link></li>
                </ul>
              </Transition>
            </div>
          </template>
          <template v-else>
            <router-link to="/login" class="btn btn-ghost btn-sm nav-cta">Accedi</router-link>
            <router-link to="/register" class="btn btn-primary btn-sm nav-cta">Inizia ora</router-link>
          </template>

          <button class="hamburger" :class="{ 'is-open': mobileMenuOpen }" @click="toggleMobileMenu" :aria-expanded="mobileMenuOpen" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <Transition name="panel">
        <div v-if="mobileMenuOpen" class="mobile-nav-panel">
          <router-link to="/landing" class="mobile-link" @click="closeMobileMenu">Home</router-link>
          <router-link to="/who-are-us" class="mobile-link" @click="closeMobileMenu">Chi siamo</router-link>
          <router-link to="/contact-us" class="mobile-link" @click="closeMobileMenu">Contattaci</router-link>
          <hr class="mobile-sep">
          <template v-if="isLoggedIn">
            <router-link :to="defaultAppRoute" class="mobile-link" @click="closeMobileMenu"><i class="bi bi-speedometer2"/><span>Dashboard</span></router-link>
            <router-link v-if="showNav('profilo')" to="/profile/show" class="mobile-link" @click="closeMobileMenu"><i class="bi bi-person"/><span>Profilo</span></router-link>
            <router-link to="/logout" class="mobile-link mobile-link--danger" @click="closeMobileMenu"><i class="bi bi-box-arrow-right"/><span>Esci</span></router-link>
          </template>
          <template v-else>
            <router-link to="/login" class="mobile-link" @click="closeMobileMenu">Accedi</router-link>
            <router-link to="/register" class="mobile-link mobile-link--primary" @click="closeMobileMenu">Inizia ora</router-link>
          </template>
        </div>
      </Transition>
    </nav>

    <main class="main-content">
      <slot />
    </main>

    <footer class="app-footer">
      <div class="app-footer-inner">
        <div class="app-footer-brand">
          <span class="tv-brand-mark sm">T</span>
          <span>Tavolo</span>
          <span class="app-footer-tag">Il gestionale dei ristoranti moderni</span>
        </div>
        <nav class="app-footer-nav">
          <router-link to="/terms">Termini</router-link>
          <router-link to="/privacy-policy">Privacy</router-link>
          <router-link to="/contact-us">Contatti</router-link>
        </nav>
        <div class="app-footer-copy">&copy; {{ new Date().getFullYear() }} Tavolo</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============== APP variant — workspace shell ============== */
.app-shell-app {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
  background: var(--bg-sunk, var(--bg-2));
  color: var(--ink);
  font-family: var(--f-sans);
}
.app-shell-sidebar { grid-column: 1; grid-row: 1; }
.app-shell-main {
  grid-column: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.mobile-drawer-backdrop {
  position: fixed; inset: 0;
  background: color-mix(in oklab, black 35%, transparent);
  z-index: 300;
  display: flex;
}
.mobile-drawer {
  width: 280px; max-width: 86%;
  background: var(--paper);
  height: 100%;
  display: flex; flex-direction: column;
  box-shadow: 4px 0 24px rgb(0 0 0 / 0.16);
  overflow-y: auto;
}
.mobile-drawer-h {
  display: flex; align-items: center; gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
}
.mobile-drawer-h > div:first-of-type { flex: 1; min-width: 0; }
.mobile-drawer-nav { padding: 12px; display: flex; flex-direction: column; gap: 2px; }
.mobile-drawer-sep { border: none; border-top: 1px solid var(--line); margin: 8px 4px; }
.mobile-drawer .md-side-item { color: var(--ink-2); padding: 12px 14px; }
.mobile-drawer .md-side-item--danger { color: var(--danger); }
.mobile-drawer .md-side-item--danger i { color: var(--danger); }

.drawer-enter-active, .drawer-leave-active { transition: opacity 200ms ease; }
.drawer-enter-active .mobile-drawer, .drawer-leave-active .mobile-drawer {
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .mobile-drawer, .drawer-leave-to .mobile-drawer { transform: translateX(-100%); }

/* Tablet — narrower sidebar */
@media (min-width: 861px) and (max-width: 1199px) {
  .app-shell-app { grid-template-columns: 64px 1fr; }
}

/* Mobile — sidebar completamente nascosta, nessuno spazio riservato */
@media (max-width: 860px) {
  .app-shell-app { grid-template-columns: 1fr !important; }
  .app-shell-sidebar { display: none !important; }
  .app-shell-main { grid-column: 1; }
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
  .brand-tag { display: none; }
  .nav-inner { padding: 0 var(--s-4); gap: var(--s-3); }
  .app-footer-inner { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>

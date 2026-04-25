<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { API_BASE, fetchReservations, fetchOrders } from '@/utils';

const username = ref('');
const store = useStore();
const router = useRouter();
const route = useRoute();
const isLoggedIn = ref(false);
const mobileMenuOpen = ref(false);
const userMenuOpen = ref(false);
const pendingCount = ref(0);
const activeOrdersCount = ref(0);
let pendingPollId = null;

const THEME_KEY = 'tavolo_theme';
const ACCENT_KEY = 'tavolo_accent';
const theme = ref(localStorage.getItem(THEME_KEY) || 'light');
const accent = ref(localStorage.getItem(ACCENT_KEY) || 'red');

const applyTheme = () => {
  document.documentElement.setAttribute('data-theme', theme.value);
  document.documentElement.setAttribute('data-accent', accent.value);
};
applyTheme();
watch([theme, accent], () => {
  localStorage.setItem(THEME_KEY, theme.value);
  localStorage.setItem(ACCENT_KEY, accent.value);
  applyTheme();
});

const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
};

const checkLog = async () => {
  isLoggedIn.value = store.getters.isAuthenticated;
  if (isLoggedIn.value) {
    const token = store.getters.getToken;
    try {
      const response = await fetch(`${API_BASE}/api/users/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await response.json();
      username.value = userData.username;
    } catch (error) {
      console.error('Errore nel recupero dati utente:', error.message);
    }
  }
};

const refreshPendingCount = async () => {
  if (!store.getters.isAuthenticated) return;
  const token = store.getters.getToken;
  if (!token) return;
  try {
    const res = await fetchReservations({ status: 'pending', pageSize: 1 }, token);
    pendingCount.value = res?.meta?.pagination?.total ?? 0;
  } catch (_err) { /* silent */ }
};

const refreshActiveOrdersCount = async () => {
  if (!store.getters.isAuthenticated) return;
  const token = store.getters.getToken;
  if (!token) return;
  try {
    const res = await fetchOrders({ status: 'active', pageSize: 1 }, token);
    activeOrdersCount.value = res?.meta?.pagination?.total ?? 0;
  } catch (_err) { /* silent */ }
};

const toggleMobileMenu = () => { mobileMenuOpen.value = !mobileMenuOpen.value; };
const closeMobileMenu = () => { mobileMenuOpen.value = false; };
const toggleUserMenu = () => { userMenuOpen.value = !userMenuOpen.value; };
const closeUserMenu = () => { userMenuOpen.value = false; };

const handleClickOutside = (e) => {
  if (!e.target.closest('.user-menu')) userMenuOpen.value = false;
};

const userInitial = computed(() => (username.value || 'U').charAt(0).toUpperCase());

const roles = [
  { key: 'sala', label: 'Sala', path: '/orders', icon: 'bi-grid-3x3-gap' },
  { key: 'cucina', label: 'Cucina', path: '/kitchen', icon: 'bi-fire' },
  { key: 'prenotazioni', label: 'Prenotazioni', path: '/reservations', icon: 'bi-calendar-check' },
  { key: 'menu', label: 'Menu', path: '/menu-handler', icon: 'bi-journal-text' },
  { key: 'manager', label: 'Manager', path: '/dashboard', icon: 'bi-speedometer2' },
];

const activeRole = computed(() => {
  const p = route.path;
  if (p.startsWith('/kitchen')) return 'cucina';
  if (p.startsWith('/orders')) return 'sala';
  if (p.startsWith('/reservations')) return 'prenotazioni';
  if (p.startsWith('/menu-handler')) return 'menu';
  if (p.startsWith('/dashboard') || p === '/' || p === '/home') return 'manager';
  return '';
});

const isLandingPage = computed(() => {
  const p = route.path;
  return (p === '/' || p === '/home' || p === '/dashboard') && !isLoggedIn.value;
});

onMounted(async () => {
  await checkLog();
  if (isLoggedIn.value) {
    await Promise.all([refreshPendingCount(), refreshActiveOrdersCount()]);
    pendingPollId = setInterval(() => {
      refreshPendingCount();
      refreshActiveOrdersCount();
    }, 30000);
  }
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  if (pendingPollId) clearInterval(pendingPollId);
  document.removeEventListener('click', handleClickOutside);
});

watch(() => route.path, () => {
  closeMobileMenu();
  closeUserMenu();
});
</script>

<template>
  <div class="app-shell" :data-landing="isLandingPage ? 'true' : 'false'">
    <nav class="nav" :class="{ 'nav--landing': isLandingPage }">
      <div class="nav-inner">
        <router-link :to="isLoggedIn ? '/dashboard' : '/'" class="brand" @click="closeMobileMenu">
          <span class="brand-mark" aria-hidden="true">T</span>
          <span class="brand-text">Tavolo</span>
          <span class="brand-tag">beta</span>
        </router-link>

        <div v-if="isLoggedIn" class="roles" role="tablist" aria-label="Vista ruolo">
          <router-link
            v-for="r in roles"
            :key="r.key"
            :to="r.path"
            class="role-btn"
            :class="{ 'is-active': activeRole === r.key }"
            role="tab"
            :aria-selected="activeRole === r.key"
          >
            <i :class="['bi', r.icon]" aria-hidden="true"></i>
            <span>{{ r.label }}</span>
            <span
              v-if="r.key === 'prenotazioni' && pendingCount > 0"
              class="role-badge"
              :aria-label="`${pendingCount} richieste in attesa`"
            >{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
            <span
              v-if="r.key === 'sala' && activeOrdersCount > 0"
              class="role-badge role-badge--info"
              :aria-label="`${activeOrdersCount} ordini attivi`"
            >{{ activeOrdersCount > 99 ? '99+' : activeOrdersCount }}</span>
          </router-link>
        </div>

        <div v-else class="public-links">
          <router-link to="/" class="public-link" active-class="is-active" :class="{ 'is-active': route.path === '/' || route.path === '/home' || route.path === '/dashboard' }">Home</router-link>
          <router-link to="/who-are-us" class="public-link" active-class="is-active">Chi siamo</router-link>
          <router-link to="/contact-us" class="public-link" active-class="is-active">Contattaci</router-link>
        </div>

        <div class="nav-tools">
          <button
            class="icon-btn"
            :title="theme === 'dark' ? 'Passa a tema chiaro' : 'Passa a tema scuro'"
            :aria-label="theme === 'dark' ? 'Passa a tema chiaro' : 'Passa a tema scuro'"
            @click="toggleTheme"
          >
            <i :class="['bi', theme === 'dark' ? 'bi-sun' : 'bi-moon-stars']" aria-hidden="true"></i>
          </button>

          <template v-if="isLoggedIn">
            <router-link
              to="/reservations"
              class="icon-btn icon-btn--bell"
              :class="{ 'has-notif': pendingCount > 0 }"
              title="Notifiche"
              aria-label="Notifiche"
            >
              <i class="bi bi-bell" aria-hidden="true"></i>
              <span v-if="pendingCount > 0" class="icon-dot" aria-hidden="true"></span>
            </router-link>

            <div class="user-menu">
              <button class="avatar" @click.stop="toggleUserMenu" :aria-expanded="userMenuOpen" aria-haspopup="menu">
                <span>{{ userInitial }}</span>
              </button>
              <Transition name="fade">
                <ul v-if="userMenuOpen" class="user-dropdown" role="menu">
                  <li class="user-dropdown-header">
                    <div class="user-dropdown-name">{{ username || 'Utente' }}</div>
                    <div class="user-dropdown-role">Operatore</div>
                  </li>
                  <li><router-link to="/profile/show" class="user-dropdown-item" @click="closeUserMenu">
                    <i class="bi bi-person" aria-hidden="true"></i><span>Profilo</span>
                  </router-link></li>
                  <li><router-link to="/dashboard" class="user-dropdown-item" @click="closeUserMenu">
                    <i class="bi bi-speedometer2" aria-hidden="true"></i><span>Dashboard</span>
                  </router-link></li>
                  <li><hr class="user-dropdown-sep"></li>
                  <li><router-link to="/logout" class="user-dropdown-item user-dropdown-item--danger" @click="closeUserMenu">
                    <i class="bi bi-box-arrow-right" aria-hidden="true"></i><span>Esci</span>
                  </router-link></li>
                </ul>
              </Transition>
            </div>
          </template>

          <template v-else>
            <router-link to="/login" class="btn btn-ghost btn-sm nav-cta">Accedi</router-link>
            <router-link to="/register" class="btn btn-primary btn-sm nav-cta">Inizia ora</router-link>
          </template>

          <button
            class="hamburger"
            :class="{ 'is-open': mobileMenuOpen }"
            @click="toggleMobileMenu"
            :aria-expanded="mobileMenuOpen"
            aria-label="Menu"
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <Transition name="panel">
        <div v-if="mobileMenuOpen" class="mobile-nav-panel">
          <template v-if="isLoggedIn">
            <router-link v-for="r in roles" :key="r.key" :to="r.path" class="mobile-link" :class="{ 'is-active': activeRole === r.key }" @click="closeMobileMenu">
              <i :class="['bi', r.icon]" aria-hidden="true"></i>
              <span>{{ r.label }}</span>
              <span v-if="r.key === 'prenotazioni' && pendingCount > 0" class="role-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
              <span v-if="r.key === 'sala' && activeOrdersCount > 0" class="role-badge role-badge--info">{{ activeOrdersCount > 99 ? '99+' : activeOrdersCount }}</span>
            </router-link>
            <hr class="mobile-sep">
            <router-link to="/profile/show" class="mobile-link" @click="closeMobileMenu">
              <i class="bi bi-person" aria-hidden="true"></i><span>Profilo</span>
            </router-link>
            <router-link to="/logout" class="mobile-link mobile-link--danger" @click="closeMobileMenu">
              <i class="bi bi-box-arrow-right" aria-hidden="true"></i><span>Esci</span>
            </router-link>
          </template>
          <template v-else>
            <router-link to="/" class="mobile-link" @click="closeMobileMenu">Home</router-link>
            <router-link to="/who-are-us" class="mobile-link" @click="closeMobileMenu">Chi siamo</router-link>
            <router-link to="/contact-us" class="mobile-link" @click="closeMobileMenu">Contattaci</router-link>
            <hr class="mobile-sep">
            <router-link to="/login" class="mobile-link" @click="closeMobileMenu">Accedi</router-link>
            <router-link to="/register" class="mobile-link mobile-link--primary" @click="closeMobileMenu">Inizia ora</router-link>
          </template>
        </div>
      </Transition>
    </nav>

    <main class="main-content">
      <slot />
    </main>

    <footer v-if="!isLandingPage" class="app-footer">
      <div class="app-footer-inner">
        <div class="app-footer-brand">
          <span class="brand-mark brand-mark--sm" aria-hidden="true">T</span>
          <span>Tavolo</span>
          <span class="app-footer-tag">Il gestionale dei ristoranti moderni</span>
        </div>
        <nav class="app-footer-nav">
          <router-link to="/terms">Termini</router-link>
          <router-link to="/privacy-policy">Privacy</router-link>
          <router-link to="/contact-us">Contatti</router-link>
        </nav>
        <div class="app-footer-copy">&copy; {{ new Date().getFullYear() }} Tavolo — Tutti i diritti riservati</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

/* ======================================================
   NAV
   ====================================================== */
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
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  height: 64px;
  display: flex;
  align-items: center;
  gap: var(--s-5);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  text-decoration: none;
  color: var(--ink);
  flex-shrink: 0;
}
.brand-mark {
  width: 34px; height: 34px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--paper);
  border-radius: var(--r-md);
  font-family: var(--f-mono, 'Geist Mono', ui-monospace, monospace);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.02em;
}
.brand-mark--sm { width: 24px; height: 24px; font-size: 11px; border-radius: 6px; }
.brand-text {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.brand-tag {
  font-family: var(--f-mono, 'Geist Mono', ui-monospace, monospace);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-3);
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ink) 8%, transparent);
  margin-left: 2px;
}

/* Roles */
.roles {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: color-mix(in oklab, var(--ink) 5%, transparent);
  border-radius: 999px;
  margin-left: var(--s-3);
}
.role-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: 999px;
  transition: color 120ms, background 120ms;
  position: relative;
  white-space: nowrap;
}
.role-btn i { font-size: 14px; opacity: 0.85; }
.role-btn:hover { color: var(--ink); }
.role-btn.is-active {
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--line);
}
.role-btn.is-active i { opacity: 1; color: var(--ac); }
.role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 2px;
  background: var(--ac);
  color: var(--paper);
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  line-height: 1;
}
.role-badge--info { background: var(--ink); }

/* Public links */
.public-links {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin-left: var(--s-5);
}
.public-link {
  padding: 8px 14px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: var(--r-sm);
  transition: color 120ms, background 120ms;
}
.public-link:hover { color: var(--ink); background: color-mix(in oklab, var(--ink) 5%, transparent); }
.public-link.is-active { color: var(--ink); }

/* Tools */
.nav-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.icon-btn {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink-2);
  border-radius: var(--r-md);
  cursor: pointer;
  text-decoration: none;
  position: relative;
  transition: color 120ms, background 120ms, border-color 120ms;
}
.icon-btn:hover {
  color: var(--ink);
  background: color-mix(in oklab, var(--ink) 6%, transparent);
}
.icon-btn i { font-size: 16px; }
.icon-btn--bell.has-notif { color: var(--ac); }
.icon-dot {
  position: absolute;
  top: 7px; right: 8px;
  width: 7px; height: 7px;
  border-radius: 999px;
  background: var(--ac);
  box-shadow: 0 0 0 2px var(--bg);
  animation: pulse-dot 1.4s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.25); }
}

.nav-cta { margin-left: 2px; }

/* Avatar */
.user-menu { position: relative; }
.avatar {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  background: var(--ink);
  color: var(--paper);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 600;
  font-size: 13px;
  transition: transform 120ms, box-shadow 120ms;
}
.avatar:hover { transform: scale(1.05); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 20%, transparent); }

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: 0 12px 40px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04);
  padding: 6px;
  list-style: none;
  margin: 0;
  z-index: 50;
}
.user-dropdown-header {
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
.user-dropdown-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.user-dropdown-role {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 2px;
  letter-spacing: 0.02em;
}
.user-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: var(--r-sm);
  transition: background 120ms, color 120ms;
}
.user-dropdown-item:hover { background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink); }
.user-dropdown-item i { font-size: 15px; opacity: 0.8; }
.user-dropdown-item--danger { color: var(--dan); }
.user-dropdown-item--danger:hover { background: color-mix(in oklab, var(--dan) 10%, transparent); color: var(--dan); }
.user-dropdown-sep { border: none; border-top: 1px solid var(--line); margin: 4px 0; }

/* Hamburger */
.hamburger {
  display: none;
  width: 36px; height: 36px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: none; border: none; cursor: pointer;
  border-radius: var(--r-md);
}
.hamburger span {
  display: block;
  width: 18px; height: 2px;
  background: var(--ink);
  border-radius: 999px;
  transition: transform 220ms, opacity 220ms;
}
.hamburger.is-open span:nth-child(1) { transform: rotate(45deg) translate(4px, 5px); }
.hamburger.is-open span:nth-child(2) { opacity: 0; }
.hamburger.is-open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -5px); }

/* Mobile panel */
.mobile-nav-panel {
  border-top: 1px solid var(--line);
  background: var(--bg);
  padding: var(--s-3) var(--s-6) var(--s-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mobile-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px;
  font-weight: 500;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: var(--r-md);
  transition: background 120ms, color 120ms;
}
.mobile-link i { font-size: 17px; opacity: 0.85; }
.mobile-link:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); color: var(--ink); }
.mobile-link.is-active { background: color-mix(in oklab, var(--ac) 10%, transparent); color: var(--ac); }
.mobile-link.is-active i { color: var(--ac); }
.mobile-link--primary { color: var(--ac); font-weight: 600; }
.mobile-link--danger { color: var(--dan); }
.mobile-sep { border: none; border-top: 1px solid var(--line); margin: 8px 0; }

/* Main */
.main-content {
  flex: 1;
  background: var(--bg);
}

/* Footer */
.app-footer {
  background: var(--bg-2);
  border-top: 1px solid var(--line);
  padding: var(--s-7) 0;
  margin-top: var(--s-8);
}
.app-footer-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-5);
  flex-wrap: wrap;
}
.app-footer-brand {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-weight: 600;
  color: var(--ink);
}
.app-footer-tag {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 400;
  font-size: 12px;
  color: var(--ink-3);
  margin-left: var(--s-2);
  padding-left: var(--s-2);
  border-left: 1px solid var(--line);
}
.app-footer-nav {
  display: flex;
  gap: var(--s-5);
}
.app-footer-nav a {
  font-size: 14px;
  color: var(--ink-2);
  text-decoration: none;
  transition: color 120ms;
}
.app-footer-nav a:hover { color: var(--ac); }
.app-footer-copy {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 140ms, transform 140ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
.panel-enter-active, .panel-leave-active { transition: max-height 280ms ease, opacity 200ms; overflow: hidden; }
.panel-enter-from, .panel-leave-to { max-height: 0; opacity: 0; }
.panel-enter-to, .panel-leave-from { max-height: 600px; opacity: 1; }

/* Landing nav (slimmer CTAs, transparent-ish) */
.nav--landing { border-bottom-color: transparent; }
.nav--landing .nav-inner { height: 68px; }

/* Responsive */
@media (max-width: 1080px) {
  .roles .role-btn span:not(.role-badge) { display: none; }
  .roles .role-btn { padding: 7px 10px; }
  .roles .role-btn i { font-size: 15px; }
}
@media (max-width: 860px) {
  .roles, .public-links { display: none; }
  .hamburger { display: flex; }
  .nav-cta, .icon-btn--bell { display: none; }
  .brand-tag { display: none; }
  .nav-inner { padding: 0 var(--s-4); gap: var(--s-3); }
}
@media (max-width: 540px) {
  .avatar { display: none; }
  .app-footer-inner { flex-direction: column; align-items: flex-start; }
}
</style>

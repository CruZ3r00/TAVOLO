<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Footer from '@/components/Footer.vue';
import { useStore } from 'vuex';
import { API_BASE, fetchReservations, fetchOrders } from '@/utils';

const username = ref('');
const store = useStore();
const router = useRouter();
const isLoggedIn = ref(false);
const mobileMenuOpen = ref(false);
const pendingCount = ref(0);
const activeOrdersCount = ref(0);
let pendingPollId = null;

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
  } catch (_err) {
    // Silenzioso: il badge è non-critico.
  }
};

const refreshActiveOrdersCount = async () => {
  if (!store.getters.isAuthenticated) return;
  const token = store.getters.getToken;
  if (!token) return;
  try {
    const res = await fetchOrders({ status: 'active', pageSize: 1 }, token);
    activeOrdersCount.value = res?.meta?.pagination?.total ?? 0;
  } catch (_err) {
    // Silenzioso: il badge è non-critico.
  }
};

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};

onMounted(async () => {
  await checkLog();
  if (isLoggedIn.value) {
    await Promise.all([refreshPendingCount(), refreshActiveOrdersCount()]);
    pendingPollId = setInterval(() => {
      refreshPendingCount();
      refreshActiveOrdersCount();
    }, 30000);
  }
});

onBeforeUnmount(() => {
  if (pendingPollId) clearInterval(pendingPollId);
});
</script>

<template>
  <div class="app-shell">
    <!-- Navbar -->
    <nav class="navbar-wrapper">
      <div class="navbar-inner">
        <!-- Brand -->
        <router-link to="/dashboard" class="navbar-brand" @click="closeMobileMenu">
          <div class="brand-icon">
            <i class="bi bi-shop"></i>
          </div>
          <span class="brand-text">MenuCMS</span>
        </router-link>

        <!-- Desktop nav -->
        <div class="navbar-center">
          <template v-if="isLoggedIn">
            <router-link to="/dashboard" class="nav-item" active-class="nav-item-active">
              <i class="bi bi-grid-1x2 nav-item-icon"></i>
              <span>Dashboard</span>
            </router-link>
            <router-link to="/menu-handler" class="nav-item" active-class="nav-item-active">
              <i class="bi bi-journal-text nav-item-icon"></i>
              <span>Menu</span>
            </router-link>
            <router-link to="/reservations" class="nav-item" active-class="nav-item-active">
              <i class="bi bi-calendar-check nav-item-icon"></i>
              <span>Prenotazioni</span>
              <span v-if="pendingCount > 0" class="nav-item-badge" :aria-label="`${pendingCount} richieste in attesa`">
                {{ pendingCount > 99 ? '99+' : pendingCount }}
              </span>
            </router-link>
            <router-link to="/orders" class="nav-item" active-class="nav-item-active">
              <i class="bi bi-receipt nav-item-icon"></i>
              <span>Ordinazioni</span>
              <span v-if="activeOrdersCount > 0" class="nav-item-badge nav-item-badge-info" :aria-label="`${activeOrdersCount} ordini attivi`">
                {{ activeOrdersCount > 99 ? '99+' : activeOrdersCount }}
              </span>
            </router-link>
            <router-link to="/site-config" class="nav-item" active-class="nav-item-active">
              <i class="bi bi-globe2 nav-item-icon"></i>
              <span>Sito</span>
            </router-link>
          </template>
          <template v-else>
            <router-link to="/dashboard" class="nav-item" active-class="nav-item-active">
              <span>Home</span>
            </router-link>
            <router-link to="/who-are-us" class="nav-item" active-class="nav-item-active">
              <span>Chi siamo</span>
            </router-link>
            <router-link to="/contact-us" class="nav-item" active-class="nav-item-active">
              <span>Contattaci</span>
            </router-link>
          </template>
        </div>

        <!-- Right section -->
        <div class="navbar-right">
          <template v-if="isLoggedIn">
            <div class="user-menu">
              <button class="user-trigger" data-bs-toggle="dropdown" aria-expanded="false">
                <div class="user-avatar">
                  {{ (username || 'U').charAt(0).toUpperCase() }}
                </div>
                <span class="user-name">{{ username || 'Profilo' }}</span>
                <i class="bi bi-chevron-down user-chevron"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end user-dropdown">
                <li>
                  <router-link to="/profile/show" class="dropdown-item user-dropdown-item">
                    <i class="bi bi-person"></i>
                    <span>Profilo</span>
                  </router-link>
                </li>
                <li><hr class="dropdown-divider"></li>
                <li>
                  <router-link to="/logout" class="dropdown-item user-dropdown-item user-dropdown-danger">
                    <i class="bi bi-box-arrow-right"></i>
                    <span>Esci</span>
                  </router-link>
                </li>
              </ul>
            </div>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-item">Accedi</router-link>
            <router-link to="/register" class="ds-btn ds-btn-primary ds-btn-sm">Registrati</router-link>
          </template>

          <!-- Mobile hamburger -->
          <button class="mobile-toggle" @click="toggleMobileMenu" :class="{ active: mobileMenuOpen }">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <!-- Mobile menu -->
      <Transition name="slide-down">
        <div v-if="mobileMenuOpen" class="mobile-nav">
          <template v-if="isLoggedIn">
            <router-link to="/dashboard" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-grid-1x2"></i> Dashboard
            </router-link>
            <router-link to="/menu-handler" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-journal-text"></i> Menu
            </router-link>
            <router-link to="/reservations" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-calendar-check"></i>
              <span>Prenotazioni</span>
              <span v-if="pendingCount > 0" class="nav-item-badge">
                {{ pendingCount > 99 ? '99+' : pendingCount }}
              </span>
            </router-link>
            <router-link to="/orders" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-receipt"></i>
              <span>Ordinazioni</span>
              <span v-if="activeOrdersCount > 0" class="nav-item-badge nav-item-badge-info">
                {{ activeOrdersCount > 99 ? '99+' : activeOrdersCount }}
              </span>
            </router-link>
            <router-link to="/site-config" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-globe2"></i> Configurazione Sito
            </router-link>
            <router-link to="/profile/show" class="mobile-nav-item" @click="closeMobileMenu">
              <i class="bi bi-person"></i> Profilo
            </router-link>
            <div class="mobile-nav-divider"></div>
            <router-link to="/logout" class="mobile-nav-item mobile-nav-danger" @click="closeMobileMenu">
              <i class="bi bi-box-arrow-right"></i> Esci
            </router-link>
          </template>
          <template v-else>
            <router-link to="/dashboard" class="mobile-nav-item" @click="closeMobileMenu">Home</router-link>
            <router-link to="/who-are-us" class="mobile-nav-item" @click="closeMobileMenu">Chi siamo</router-link>
            <router-link to="/contact-us" class="mobile-nav-item" @click="closeMobileMenu">Contattaci</router-link>
            <div class="mobile-nav-divider"></div>
            <router-link to="/login" class="mobile-nav-item" @click="closeMobileMenu">Accedi</router-link>
            <router-link to="/register" class="mobile-nav-item mobile-nav-primary" @click="closeMobileMenu">Registrati</router-link>
          </template>
        </div>
      </Transition>
    </nav>

    <!-- Page Content -->
    <main class="main-content">
      <slot />
    </main>

    <!-- Footer -->
    <Footer />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* --- Navbar --- */
.navbar-wrapper {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-bottom: 1px solid var(--color-border);
}

.navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-6);
  height: 56px;
}

/* Brand */
.navbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  text-decoration: none;
  color: var(--color-text);
  flex-shrink: 0;
}

.brand-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-md);
}

.brand-text {
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
}

/* Center nav */
.navbar-center {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.nav-item:hover {
  color: var(--color-text);
  background: var(--color-bg-subtle);
}

.nav-item-active {
  color: var(--color-text);
  background: var(--color-bg-subtle);
}

.nav-item-icon {
  font-size: var(--text-md);
  opacity: 0.7;
}

.nav-item-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  margin-left: 4px;
  background: var(--color-destructive, #dc3545);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  line-height: 1;
}

.nav-item-badge-info {
  background: var(--color-primary, #0d6efd);
}

/* Right section */
.navbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* User menu */
.user-menu {
  position: relative;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-family);
}

.user-trigger:hover {
  background: var(--color-bg-subtle);
  border-color: var(--color-border);
}

.user-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
}

.user-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}

.user-chevron {
  font-size: 10px;
  color: var(--color-text-muted);
}

.user-dropdown {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-1);
  min-width: 180px;
  margin-top: var(--space-2);
}

.user-dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.user-dropdown-item:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text);
}

.user-dropdown-danger {
  color: var(--color-destructive);
}

.user-dropdown-danger:hover {
  background: var(--color-destructive-light);
  color: var(--color-destructive);
}

/* Mobile toggle */
.mobile-toggle {
  display: none;
  flex-direction: column;
  gap: 5px;
  padding: var(--space-2);
  background: none;
  border: none;
  cursor: pointer;
}

.mobile-toggle span {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--color-text);
  border-radius: 1px;
  transition: all var(--transition-base);
}

.mobile-toggle.active span:nth-child(1) {
  transform: rotate(45deg) translateY(5px);
}

.mobile-toggle.active span:nth-child(2) {
  opacity: 0;
}

.mobile-toggle.active span:nth-child(3) {
  transform: rotate(-45deg) translateY(-5px);
}

/* Mobile nav */
.mobile-nav {
  display: none;
  flex-direction: column;
  padding: var(--space-2) var(--space-4) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.mobile-nav-item:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text);
}

.mobile-nav-danger {
  color: var(--color-destructive);
}

.mobile-nav-primary {
  color: var(--color-primary);
  font-weight: 600;
}

.mobile-nav-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--space-2) 0;
}

/* Slide down transition */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: opacity var(--transition-base), max-height var(--transition-slow);
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 400px;
}

/* Main content */
.main-content {
  flex: 1;
  background: var(--color-bg);
}

/* Responsive */
@media (max-width: 768px) {
  .navbar-center {
    display: none;
  }

  .user-menu {
    display: none;
  }

  .navbar-right .nav-item,
  .navbar-right .ds-btn {
    display: none;
  }

  .mobile-toggle {
    display: flex;
  }

  .mobile-nav {
    display: flex;
  }

  .navbar-inner {
    padding: 0 var(--space-4);
  }
}
</style>

<script setup>
// MobileTopBar: barra in alto su mobile.
// Sx: brand + titolo pagina. Centro: spaziatore. Dx: search-icon (apre
// CommandPalette) + avatar (apre dropdown con Profilo / Impostazioni / Esci).
//
// Mostrata SOLO su mobile (<= 860px). Su desktop la top nav è definita
// direttamente in AppLayout.vue.
//
// Niente hamburger / drawer: l'utente accede alle macro-schede via la
// MobileBottomNav (5 voci principali), e al profilo/impostazioni dal
// dropdown dell'avatar.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps({
  title: { type: String, default: 'ComforTables' },
  username: { type: String, default: '' },
  restaurantName: { type: String, default: '' },
  showProfile: { type: Boolean, default: false },
});

const emit = defineEmits(['open-palette']);

const route = useRoute();

const avatarLetter = computed(() => {
  const src = props.restaurantName || props.username || 'C';
  return String(src).charAt(0).toUpperCase();
});

const onOpenPalette = () => emit('open-palette');

const userMenuOpen = ref(false);
const toggleUserMenu = () => { userMenuOpen.value = !userMenuOpen.value; };
const closeUserMenu = () => { userMenuOpen.value = false; };

// Click-outside per chiudere il dropdown.
const onDocClick = (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (!t.closest('.mtb-user-menu')) closeUserMenu();
};
onMounted(() => { document.addEventListener('click', onDocClick); });
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); });

// Cambio route → chiudi dropdown.
watch(() => route.fullPath, () => closeUserMenu());
</script>

<template>
  <header class="mtb">
    <div class="mtb-title">
      <span class="tv-brand-mark sm">C</span>
      <strong class="mtb-title-text">{{ title }}</strong>
    </div>

    <div class="mtb-right">
      <button
        type="button"
        class="mtb-icon"
        aria-label="Cerca o esegui azione"
        @click="onOpenPalette"
      >
        <i class="bi bi-search" aria-hidden="true"></i>
      </button>

      <div v-if="showProfile" class="mtb-user-menu">
        <button
          type="button"
          class="mtb-avatar"
          :aria-expanded="userMenuOpen"
          aria-label="Profilo e impostazioni"
          @click.stop="toggleUserMenu"
        >
          <span>{{ avatarLetter }}</span>
        </button>

        <Transition name="mtb-fade">
          <ul v-if="userMenuOpen" class="mtb-dropdown" role="menu">
            <li class="mtb-dropdown-header">
              <div class="mtb-dropdown-name">{{ username || restaurantName || 'Utente' }}</div>
              <div v-if="restaurantName" class="mtb-dropdown-sub">{{ restaurantName }}</div>
            </li>
            <li>
              <router-link to="/profile/show" class="mtb-dropdown-item" @click="closeUserMenu">
                <i class="bi bi-person" aria-hidden="true"></i><span>Profilo</span>
              </router-link>
            </li>
            <li>
              <router-link to="/profile/show" class="mtb-dropdown-item" @click="closeUserMenu">
                <i class="bi bi-gear" aria-hidden="true"></i><span>Impostazioni</span>
              </router-link>
            </li>
            <li><hr class="mtb-dropdown-sep" /></li>
            <li>
              <router-link to="/logout" class="mtb-dropdown-item mtb-dropdown-item--danger" @click="closeUserMenu">
                <i class="bi bi-box-arrow-right" aria-hidden="true"></i><span>Esci</span>
              </router-link>
            </li>
          </ul>
        </Transition>
      </div>

      <router-link
        v-else
        to="/logout"
        class="mtb-icon"
        aria-label="Esci"
      >
        <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      </router-link>
    </div>
  </header>
</template>

<style scoped>
.mtb {
  display: none; /* visibile solo su mobile, override sotto */
  height: 52px;
  border-bottom: 1px solid var(--line);
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  background: var(--bg);
  flex-shrink: 0;
  font-family: var(--f-sans);
}
.mtb-icon {
  appearance: none;
  width: 38px; height: 38px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink);
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: background var(--dur-fast);
}
.mtb-icon:hover { background: var(--bg-hover); }
.mtb-icon i { font-size: 18px; line-height: 1; }

.mtb-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.mtb-title-text {
  font-size: 14px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtb-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mtb-user-menu { position: relative; }

.mtb-avatar {
  appearance: none;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--ac-soft);
  color: var(--ac-ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--f-mono);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid var(--line);
  cursor: pointer;
  transition: transform var(--dur-fast), background var(--dur-fast), color var(--dur-fast);
}
.mtb-avatar:active { transform: scale(0.94); }
.mtb-avatar:hover { background: var(--ac); color: var(--bg); }

.mtb-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg, 12px);
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.14));
  padding: 6px;
  list-style: none;
  margin: 0;
  z-index: 80;
}
.mtb-dropdown-header {
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
.mtb-dropdown-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mtb-dropdown-sub {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 2px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mtb-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--ink-2);
  text-decoration: none;
  border-radius: var(--r-sm, 6px);
  transition: background var(--dur-fast), color var(--dur-fast);
}
.mtb-dropdown-item i { font-size: 16px; opacity: 0.85; }
.mtb-dropdown-item:hover { background: var(--bg-hover); color: var(--ink); }
.mtb-dropdown-item--danger { color: var(--danger); }
.mtb-dropdown-item--danger:hover {
  background: color-mix(in oklab, var(--danger) 10%, transparent);
  color: var(--danger);
}
.mtb-dropdown-sep { border: none; border-top: 1px solid var(--line); margin: 4px 0; }

.mtb-fade-enter-active, .mtb-fade-leave-active {
  transition: opacity 140ms, transform 140ms;
}
.mtb-fade-enter-from, .mtb-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 860px) {
  .mtb { display: flex; }
}
</style>

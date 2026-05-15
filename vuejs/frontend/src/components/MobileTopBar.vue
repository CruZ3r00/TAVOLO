<script setup>
// MobileTopBar: barra in alto su mobile.
// Sx: hamburger (apre drawer della sidebar). Centro: brand + titolo pagina.
// Dx: search icon (apre CommandPalette) + avatar (apre user menu via route a profilo).
//
// Mostrata SOLO su mobile (<= 860px). Su desktop la top nav è definita
// direttamente in AppLayout.vue.

import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: 'ComforTables' },
  username: { type: String, default: '' },
  restaurantName: { type: String, default: '' },
  showProfile: { type: Boolean, default: false },
});

const emit = defineEmits(['open-drawer', 'open-palette']);

const avatarLetter = computed(() => {
  const src = props.restaurantName || props.username || 'C';
  return String(src).charAt(0).toUpperCase();
});

const onOpenDrawer = () => emit('open-drawer');
const onOpenPalette = () => emit('open-palette');
</script>

<template>
  <header class="mtb">
    <button
      type="button"
      class="mtb-icon"
      aria-label="Apri menu"
      @click="onOpenDrawer"
    >
      <i class="bi bi-list" aria-hidden="true"></i>
    </button>

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
      <router-link
        v-if="showProfile"
        to="/profile/show"
        class="mtb-avatar"
        aria-label="Profilo"
      >
        <span>{{ avatarLetter }}</span>
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
  transition: background var(--dur-fast);
}
.mtb-icon:hover { background: var(--bg-hover); }
.mtb-icon i { font-size: 18px; line-height: 1; }

.mtb-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mtb-title-text {
  font-size: 14px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtb-right {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mtb-avatar {
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
  transition: transform var(--dur-fast), background var(--dur-fast);
}
.mtb-avatar:active { transform: scale(0.94); }
.mtb-avatar:hover { background: var(--ac); color: var(--bg); }

@media (max-width: 860px) {
  .mtb { display: flex; }
}
</style>

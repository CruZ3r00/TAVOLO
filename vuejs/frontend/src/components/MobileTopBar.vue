<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Tavolo' },
  hasNotifications: { type: Boolean, default: false },
  username: { type: String, default: '' },
  restaurantName: { type: String, default: '' },
});
const emit = defineEmits(['menu']);

const avatarLetter = computed(() => {
  const src = props.restaurantName || props.username || 'T';
  return src.charAt(0).toUpperCase();
});
</script>

<template>
  <header class="tv-mobile-top">
    <button type="button" class="tv-mobile-top-btn" @click="emit('menu')" aria-label="Apri menu">
      <i class="bi bi-list" aria-hidden="true"></i>
    </button>
    <div class="tv-mobile-top-title">
      <span class="tv-brand-mark sm">T</span>
      <strong>{{ title }}</strong>
    </div>
    <div class="tv-mobile-top-right">
      <router-link to="/reservations" class="tv-mobile-top-btn" aria-label="Notifiche">
        <i class="bi bi-bell" aria-hidden="true"></i>
        <span v-if="hasNotifications" class="tv-mobile-top-dot" aria-hidden="true"></span>
      </router-link>
      <router-link to="/profile/show" class="tv-mobile-top-avatar" aria-label="Profilo">
        <span>{{ avatarLetter }}</span>
      </router-link>
    </div>
  </header>
</template>

<style scoped>
.tv-mobile-top-right { display: inline-flex; align-items: center; gap: 6px; }
.tv-mobile-top-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--ink); color: var(--paper);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--f-mono); font-size: 13px; font-weight: 600;
  text-decoration: none;
  border: 2px solid var(--paper);
  box-shadow: 0 0 0 1px var(--line);
  transition: transform var(--dur-fast);
}
.tv-mobile-top-avatar:active { transform: scale(0.92); }
.tv-mobile-top-avatar:hover { background: var(--ac); }
</style>

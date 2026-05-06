<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  compact: { type: Boolean, default: false },
});

const theme = ref('light');

const getSystemTheme = () => (
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
);

const applyTheme = (nextTheme) => {
  theme.value = nextTheme;
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', nextTheme === 'dark' ? '#171a20' : '#ffffff');
};

const syncTheme = () => {
  const stored = localStorage.getItem('ct-theme');
  applyTheme(stored === 'light' || stored === 'dark' ? stored : getSystemTheme());
};

const toggleTheme = () => {
  const nextTheme = theme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ct-theme', nextTheme);
  applyTheme(nextTheme);
};

const isDark = computed(() => theme.value === 'dark');
const label = computed(() => (isDark.value ? 'Passa alla modalità chiara' : 'Passa alla modalità scura'));

let media;
const handleStorage = (event) => {
  if (event.key === 'ct-theme') syncTheme();
};
const handleSystemChange = () => {
  const stored = localStorage.getItem('ct-theme');
  if (stored !== 'light' && stored !== 'dark') syncTheme();
};

onMounted(() => {
  syncTheme();
  window.addEventListener('storage', handleStorage);
  media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (media?.addEventListener) media.addEventListener('change', handleSystemChange);
  else if (media?.addListener) media.addListener(handleSystemChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage);
  if (media?.removeEventListener) media.removeEventListener('change', handleSystemChange);
  else if (media?.removeListener) media.removeListener(handleSystemChange);
});
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ 'theme-toggle--compact': compact, 'is-dark': isDark }"
    :aria-label="label"
    :title="label"
    @click="toggleTheme"
  >
    <span class="theme-toggle-track" aria-hidden="true">
      <i class="bi bi-sun"></i>
      <i class="bi bi-moon-stars"></i>
      <span class="theme-toggle-thumb"></span>
    </span>
    <span v-if="!compact" class="theme-toggle-label">{{ isDark ? 'Dark' : 'Light' }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  appearance: none;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink-2);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  font: inherit;
  transition: background var(--dur), border-color var(--dur), color var(--dur), transform var(--dur-fast);
}
.theme-toggle:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}
.theme-toggle:active {
  transform: translateY(1px);
}
.theme-toggle-track {
  position: relative;
  width: 58px;
  height: 28px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  justify-items: center;
  border-radius: 999px;
  background: var(--bg-sunk);
  color: var(--ink-3);
  overflow: hidden;
}
.theme-toggle-track i {
  position: relative;
  z-index: 1;
  font-size: 13px;
  line-height: 1;
}
.theme-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--paper);
  box-shadow: var(--shadow-sm);
  transition: transform var(--dur) var(--ease-out), background var(--dur);
}
.theme-toggle.is-dark .theme-toggle-thumb {
  transform: translateX(30px);
}
.theme-toggle-label {
  min-width: 34px;
  font-size: 12px;
  font-weight: 700;
}
.theme-toggle--compact {
  width: 40px;
  min-width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  justify-content: center;
  border-radius: 12px;
}
.theme-toggle--compact .theme-toggle-track {
  width: 28px;
  height: 28px;
  display: grid;
}
.theme-toggle--compact .theme-toggle-track i:first-child {
  display: none;
}
.theme-toggle--compact .theme-toggle-track i:nth-child(2) {
  grid-column: 1 / -1;
}
.theme-toggle--compact:not(.is-dark) .theme-toggle-track i:nth-child(2) {
  display: none;
}
.theme-toggle--compact:not(.is-dark) .theme-toggle-track i:first-child {
  display: block;
  grid-column: 1 / -1;
}
.theme-toggle--compact .theme-toggle-thumb {
  display: none;
}
</style>

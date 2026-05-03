<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { devicePersistence } from './core/persistence';

const route = useRoute();
const isPaired = ref(false);

async function refreshPairingState(): Promise<void> {
  isPaired.value = await devicePersistence.isPaired();
}

watch(() => route.fullPath, refreshPairingState, { immediate: true });

const showNav = computed(() => isPaired.value && route.path !== '/pair');
</script>

<template>
  <div class="app-shell">
    <nav v-if="showNav" class="bottom-nav">
      <router-link to="/dashboard" class="nav-item">
        <span class="nav-ico">▤</span>
        <span class="nav-lbl">Dashboard</span>
      </router-link>
      <router-link to="/settings" class="nav-item">
        <span class="nav-ico">⚙</span>
        <span class="nav-lbl">Impostazioni</span>
      </router-link>
    </nav>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.app-main {
  flex: 1;
  padding: 1rem;
  padding-bottom: 5rem;
}
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--panel);
  border-top: 1px solid var(--border);
  padding: 0.4rem 0;
  z-index: 10;
}
.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.4rem 0;
  text-decoration: none;
  color: var(--muted);
  font-size: 0.75rem;
}
.nav-item.router-link-active {
  color: var(--accent);
}
.nav-ico {
  font-size: 1.2rem;
}
</style>

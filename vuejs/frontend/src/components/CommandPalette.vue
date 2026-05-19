<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from 'vuex';

const emit = defineEmits(['add-dish', 'add-beverage', 'import-menu']);

const router = useRouter();
const route = useRoute();
const store = useStore();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref(null);

const isOnMenuPage = computed(() => route.path === '/menu-handler');

const allActions = computed(() => {
  const base = [
    { id: 'menu', icon: 'bi-journal-text', label: 'Vai al Menu', hint: '⌘M', action: () => router.push('/menu-handler') },
    { id: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', hint: '⌘D', action: () => router.push('/dashboard') },
    { id: 'reservations', icon: 'bi-calendar-check', label: 'Prenotazioni', hint: null, action: () => router.push('/reservations') },
    { id: 'orders', icon: 'bi-grid-3x3-gap', label: 'Sala / Ordini', hint: null, action: () => router.push('/orders') },
    { id: 'who', icon: 'bi-people', label: 'Chi siamo', hint: null, action: () => router.push('/who-are-us') },
    { id: 'contact', icon: 'bi-envelope', label: 'Contattaci', hint: null, action: () => router.push('/contact-us') },
    { id: 'profile', icon: 'bi-person', label: 'Profilo', hint: null, action: () => router.push('/profile/show') },
  ];

  if (isOnMenuPage.value) {
    return [
      { id: 'add-dish', icon: 'bi-plus-circle', label: 'Aggiungi piatto', hint: '⌘N', action: () => { emit('add-dish'); close(); } },
      { id: 'add-bev', icon: 'bi-cup-straw', label: 'Aggiungi bevanda', hint: '⌘⇧N', action: () => { emit('add-beverage'); close(); } },
      { id: 'import', icon: 'bi-file-earmark-arrow-up', label: 'Importa menu da PDF/immagine', hint: '⌘I', action: () => { emit('import-menu'); close(); } },
      ...base,
    ];
  }

  return base;
});

const filtered = computed(() => {
  if (!query.value.trim()) return allActions.value;
  const q = query.value.toLowerCase();
  return allActions.value.filter(a => a.label.toLowerCase().includes(q));
});

watch(filtered, () => { activeIndex.value = 0; });
watch(open, (v) => {
  if (v) nextTick(() => searchInput.value?.focus());
  else { query.value = ''; activeIndex.value = 0; }
});

const openPalette = () => { open.value = true; };
const close = () => { open.value = false; };

const runActive = () => {
  const item = filtered.value[activeIndex.value];
  if (item) { item.action(); close(); }
};

const onKeydown = (e) => {
  if (!open.value) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % Math.max(1, filtered.value.length);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + filtered.value.length) % Math.max(1, filtered.value.length);
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); runActive(); }
};

const onGlobalKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    open.value ? close() : openPalette();
  }
};

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});

defineExpose({ open: openPalette });
</script>

<template>
  <Transition name="cp-fade">
    <div v-if="open" class="cp-backdrop" @click.self="close" role="dialog" aria-modal="true" aria-label="Ricerca e azioni rapide">
      <div class="cp-panel" @keydown="onKeydown">
        <!-- Search -->
        <div class="cp-search-row">
          <i class="bi bi-search cp-search-icon" aria-hidden="true"></i>
          <input
            ref="searchInput"
            v-model="query"
            type="text"
            class="cp-search-input"
            placeholder="Cerca o esegui un'azione…"
            autocomplete="off"
            spellcheck="false"
          >
          <kbd class="cp-esc-kbd" @click="close" aria-label="Chiudi">esc</kbd>
        </div>

        <!-- Results -->
        <div class="cp-results" role="listbox">
          <div v-if="filtered.length === 0" class="cp-empty">Nessun risultato per "{{ query }}"</div>
          <button
            v-for="(item, idx) in filtered"
            :key="item.id"
            type="button"
            class="cp-item"
            :class="{ 'cp-item--active': activeIndex === idx }"
            role="option"
            :aria-selected="activeIndex === idx"
            @click="item.action(); close();"
            @mouseenter="activeIndex = idx"
          >
            <span class="cp-item-icon" aria-hidden="true"><i :class="['bi', item.icon]"></i></span>
            <span class="cp-item-label">{{ item.label }}</span>
            <kbd v-if="item.hint" class="cp-item-hint">{{ item.hint }}</kbd>
          </button>
        </div>

        <!-- Footer hint -->
        <div class="cp-footer" aria-hidden="true">
          <span><kbd class="cp-mini-kbd">↑↓</kbd> naviga</span>
          <span><kbd class="cp-mini-kbd">↵</kbd> seleziona</span>
          <span><kbd class="cp-mini-kbd">esc</kbd> chiudi</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in oklab, black 45%, transparent);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: grid;
  place-items: start center;
  padding-top: min(12vh, 120px);
}

.cp-panel {
  width: min(560px, 92vw);
  background: var(--paper);
  border-radius: 14px;
  box-shadow: var(--shadow-pop);
  border: 1px solid var(--line);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Search */
.cp-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
}
.cp-search-icon { font-size: 16px; color: var(--ink-3); flex-shrink: 0; }
.cp-search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  font-family: var(--f-sans);
  background: transparent;
  color: var(--ink);
}
.cp-search-input::placeholder { color: var(--ink-3); }
.cp-esc-kbd {
  font-family: var(--f-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--bg-elev);
  color: var(--ink-3);
  box-shadow: inset 0 -1px 0 var(--line);
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}

/* Results */
.cp-results {
  padding: 8px;
  max-height: 360px;
  overflow-y: auto;
}
.cp-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
}
.cp-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast);
  font-family: var(--f-sans);
}
.cp-item--active { background: var(--bg-sunk); }
.cp-item-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--bg-sunk);
  color: var(--ink-2);
  display: grid;
  place-items: center;
  font-size: 14px;
  flex-shrink: 0;
}
.cp-item--active .cp-item-icon { background: var(--ac-soft); color: var(--ac); }
.cp-item-label { flex: 1; font-size: 14px; color: var(--ink); }
.cp-item-hint {
  font-family: var(--f-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-3);
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-elev);
  box-shadow: inset 0 -1px 0 var(--line);
  flex-shrink: 0;
}

/* Footer */
.cp-footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-3);
}
.cp-mini-kbd {
  font-family: var(--f-mono);
  font-size: 10px;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--bg-elev);
  box-shadow: inset 0 -1px 0 var(--line);
  margin-right: 4px;
}

/* Transition */
.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity 160ms; }
.cp-fade-enter-active .cp-panel, .cp-fade-leave-active .cp-panel {
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms;
}
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; }
.cp-fade-enter-from .cp-panel, .cp-fade-leave-to .cp-panel {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}
</style>

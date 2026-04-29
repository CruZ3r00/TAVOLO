<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import { useStore } from 'vuex';
import { useRouter, useRoute } from 'vue-router';
import { API_BASE } from '@/utils';
import MenuAdder from '@/components/MenuAdder.vue';
import MenuList from '@/components/MenuList.vue';
import MenuImporter from '@/components/MenuImporter.vue';
import IngredientsManager from '@/components/IngredientsManager.vue';

const store = useStore();
const router = useRouter();
const route = useRoute();
const tkn = store.getters.getToken;

const activeTab = ref('list');

const importerRef = ref(null);
const menuListRef = ref(null);

const isImporting = ref(false);
const menuElementsCount = ref(0);
const toast = ref({ show: false, type: 'success', message: '' });
let toastTimer = null;

const loadingSubtitles = [
  "Estrazione testo dall'immagine",
  'Riconoscimento piatti',
  'Strutturazione dati',
];
const loadingSubtitleIdx = ref(0);
let subtitleTimer = null;

const startSubtitleRotation = () => {
  loadingSubtitleIdx.value = 0;
  if (subtitleTimer) clearInterval(subtitleTimer);
  subtitleTimer = setInterval(() => {
    loadingSubtitleIdx.value = (loadingSubtitleIdx.value + 1) % loadingSubtitles.length;
  }, 3000);
};
const stopSubtitleRotation = () => {
  if (subtitleTimer) { clearInterval(subtitleTimer); subtitleTimer = null; }
};

const showToast = (type, message) => {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { show: true, type, message };
  toastTimer = setTimeout(() => { toast.value.show = false; }, type === 'error' ? 5000 : 4000);
};

const verifyPayment = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/users/me`, {
      headers: { Authorization: `Bearer ${tkn}` },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.payment_method == null && 0) router.push('/add-payment');
      else if (new Date(data.end_subscription) < new Date() && 0) router.push('/renew-sub');
      else return true;
    }
  } catch (_e) { /* silent */ }
};

const handleAdder = () => { activeTab.value = 'adder'; };
const handleList = () => { activeTab.value = 'list'; };
const handleIngredients = () => { activeTab.value = 'ingredients'; };

const onRequestImport = () => { importerRef.value?.trigger(); };

const onImportLoadingStart = () => {
  isImporting.value = true;
  startSubtitleRotation();
};
const onImportLoadingEnd = () => {
  isImporting.value = false;
  stopSubtitleRotation();
};

const onImported = async (payload) => {
  const n = payload?.createdCount ?? 0;
  const mode = payload?.mode;
  const modeLabel = mode === 'replace' ? 'sostituito' : 'aggiornato';
  showToast('success', `Menu ${modeLabel}: ${n} element${n === 1 ? 'o' : 'i'} importat${n === 1 ? 'o' : 'i'}.`);
  await nextTick();
  await menuListRef.value?.refresh?.();
};

const onImportError = (msg) => { showToast('error', msg || "Errore durante l'import."); };

const onCountChanged = (n) => { menuElementsCount.value = Number(n) || 0; };

watch(() => route.fullPath, () => {
  if (route.path === '/menu-handler') activeTab.value = 'list';
});

onMounted(async () => {
  nextTick(() => { document.title = 'Menu · Tavolo'; });
  await verifyPayment();
  activeTab.value = 'list';
});

onBeforeUnmount(() => {
  stopSubtitleRotation();
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <AppLayout page-title="Menu">
    <div class="md-main">
      <header class="md-top" v-if="activeTab !== 'adder'">
        <div>
          <div class="overline">Menu · {{ menuElementsCount }} element{{ menuElementsCount === 1 ? 'o' : 'i' }}</div>
          <h1>Gestione menu</h1>
          <p>Aggiungi piatti, ingredienti e categorie. Ogni modifica si propaga subito al QR pubblico.</p>
        </div>
        <div class="md-top-tools">
          <button type="button" class="btn btn-sm" @click="onRequestImport">
            <i class="bi bi-upload"></i><span>Importa</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" @click="handleAdder">
            <i class="bi bi-plus-lg"></i><span>Nuovo piatto</span>
          </button>
        </div>
      </header>

      <div v-if="activeTab !== 'adder'" class="pf-tabs">
        <button
          type="button"
          class="pf-tab"
          :class="{ active: activeTab === 'list' }"
          @click="handleList"
        >
          <i class="bi bi-list-ul"></i> Piatti
        </button>
        <button
          type="button"
          class="pf-tab"
          :class="{ active: activeTab === 'ingredients' }"
          @click="handleIngredients"
        >
          <i class="bi bi-basket"></i> Ingredienti
        </button>
      </div>

      <div class="menu-content">
        <MenuAdder v-if="activeTab === 'adder'" @ViewList="handleList" />
        <MenuList
          v-else-if="activeTab === 'list'"
          ref="menuListRef"
          @AddElement="handleAdder"
          @RequestImport="onRequestImport"
          @count-changed="onCountChanged"
        />
        <IngredientsManager v-else-if="activeTab === 'ingredients'" />
      </div>

      <MenuImporter
        ref="importerRef"
        :current-count="menuElementsCount"
        @loading-start="onImportLoadingStart"
        @loading-end="onImportLoadingEnd"
        @imported="onImported"
        @error="onImportError"
      />
    </div>

    <!-- Overlay loading full-screen durante l'analisi OCR -->
    <Teleport to="body">
      <div v-if="isImporting" class="import-overlay" role="status" aria-live="polite">
        <div class="import-overlay-spinner" aria-hidden="true"></div>
        <h3 class="import-overlay-title">Stiamo analizzando il tuo menu…</h3>
        <p class="import-overlay-subtitle">{{ loadingSubtitles[loadingSubtitleIdx] }}</p>
        <div class="import-overlay-progress">
          <div class="import-overlay-progress-bar"></div>
        </div>
        <p class="import-overlay-warn">
          <i class="bi bi-exclamation-triangle-fill"></i>
          Operazione in corso. Non chiudere o ricaricare la pagina.
        </p>
      </div>
    </Teleport>

    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="toast.show"
          class="md-toast"
          :class="toast.type === 'error' ? 'md-toast-error' : 'md-toast-success'"
          role="alert"
        >
          <i :class="['bi', toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill']"></i>
          <span>{{ toast.message }}</span>
          <button type="button" class="import-toast-close" aria-label="Chiudi" @click="toast.show = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </Transition>
    </Teleport>
  </AppLayout>
</template>

<style scoped>
.menu-content { display: flex; flex-direction: column; gap: 16px; }

.import-overlay {
  position: fixed; inset: 0;
  background: color-mix(in oklab, black 85%, transparent);
  backdrop-filter: blur(8px);
  z-index: 500;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px;
  padding: 24px;
  color: var(--paper);
  text-align: center;
}
.import-overlay-spinner {
  width: 56px; height: 56px;
  border: 3px solid color-mix(in oklab, var(--paper) 18%, transparent);
  border-top-color: var(--ac);
  border-radius: 50%;
  animation: import-spin 800ms linear infinite;
}
@keyframes import-spin { to { transform: rotate(360deg); } }
.import-overlay-title { margin: 8px 0 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }
.import-overlay-subtitle { margin: 0; font-size: 14px; opacity: 0.8; min-height: 22px; }
.import-overlay-progress {
  width: min(420px, 100%);
  height: 6px;
  background: color-mix(in oklab, var(--paper) 14%, transparent);
  border-radius: 999px;
  overflow: hidden;
  margin-top: 8px;
}
.import-overlay-progress-bar {
  height: 100%;
  width: 50%;
  background: linear-gradient(90deg, var(--ac), color-mix(in oklab, var(--ac) 60%, var(--paper)));
  border-radius: 999px;
  animation: import-progress 1.6s ease-in-out infinite;
}
@keyframes import-progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.import-overlay-warn {
  margin: 16px 0 0;
  font-size: 12.5px;
  opacity: 0.75;
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--f-mono);
}

.md-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 600;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  background: var(--paper);
  border: 1px solid var(--line);
  font-size: 13.5px;
  font-weight: 500;
  max-width: 420px;
}
.md-toast i { font-size: 16px; flex-shrink: 0; }
.md-toast-success { background: color-mix(in oklab, var(--ok) 10%, var(--paper)); color: var(--ok-ink); border-color: color-mix(in oklab, var(--ok) 30%, transparent); }
.md-toast-error { background: color-mix(in oklab, var(--danger) 10%, var(--paper)); color: var(--danger); border-color: color-mix(in oklab, var(--danger) 30%, transparent); }
.import-toast-close {
  appearance: none; border: none; background: transparent;
  color: inherit; cursor: pointer; padding: 4px;
  border-radius: var(--r-sm);
  display: inline-flex; align-items: center; justify-content: center;
}
.import-toast-close:hover { background: color-mix(in oklab, currentColor 10%, transparent); }

.toast-enter-active, .toast-leave-active { transition: opacity 200ms, transform 200ms; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

@media (max-width: 860px) {
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
}
</style>

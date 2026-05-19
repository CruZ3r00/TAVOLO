<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick, watch, computed } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import { useStore } from 'vuex';
import { useRouter, useRoute } from 'vue-router';
import { API_BASE, fetchBillingStatus } from '@/utils';
import MenuAdder from '@/components/MenuAdder.vue';
import MenuList from '@/components/MenuList.vue';
import MenuImporter from '@/components/MenuImporter.vue';
import IngredientsManager from '@/components/IngredientsManager.vue';
import BeverageList from '@/components/BeverageList.vue';
import PantryView from '@/components/PantryView.vue';
import BarShiftPanel from '@/components/BarShiftPanel.vue';
import OrdersHistory from '@/components/OrdersHistory.vue';
import TeleportCompat from '@/lib/compat/teleport.js';
import { STAFF_ROLES, staffRole } from '@/staffAccess';

const store = useStore();
const router = useRouter();
const route = useRoute();
const tkn = store.getters.getToken;

const activeTab = ref('list');
const adderMode = ref('dish');
const showBarShiftModal = ref(false);
const showHistoryModal = ref(false);
const fabOpen = ref(false);

const currentUser = computed(() => store.getters.getUser || null);
const isOwner = computed(() => staffRole(currentUser.value) === STAFF_ROLES.OWNER);
const billingPlan = ref(null);
const isPro = computed(() => {
  if (billingPlan.value) return billingPlan.value === 'pro';
  return String(currentUser.value?.subscription_plan || '').toLowerCase() === 'pro';
});

const importerRef = ref(null);
const menuListRef = ref(null);
const beverageListRef = ref(null);

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
    if (response.ok) return true;
  } catch (_e) { /* silent */ }
};

const handleAdder = () => {
  adderMode.value = activeTab.value === 'beverages' ? 'beverage' : 'dish';
  activeTab.value = 'adder';
  fabOpen.value = false;
};
const handleAdderFromBeverage = () => {
  adderMode.value = 'beverage';
  activeTab.value = 'adder';
  fabOpen.value = false;
};
const handleList = () => { activeTab.value = 'list'; fabOpen.value = false; };
const handleBeverages = () => { activeTab.value = 'beverages'; fabOpen.value = false; };
const handleIngredients = () => { activeTab.value = 'ingredients'; fabOpen.value = false; };
const handlePantry = () => { activeTab.value = 'pantry'; fabOpen.value = false; };

const onRequestImport = () => { importerRef.value?.trigger(); fabOpen.value = false; };

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
  await beverageListRef.value?.refresh?.();
};

const onImportError = (msg) => { showToast('error', msg || "Errore durante l'import."); };
const onCountChanged = (n) => { menuElementsCount.value = Number(n) || 0; };
const onElementUpdated = async () => {
  await nextTick();
  await beverageListRef.value?.refresh?.();
};

// MenuAdder ha appena salvato una nuova bevanda con `is_beverage=true` e
// l'utente ha cliccato "Configura ricetta →". Passa alla tab Bevande,
// aspetta il mount di BeverageList e gli chiede di aprire l'editor avanzato
// sul nuovo elemento (la lista verrà refreshata in parallelo).
const onOpenRecipeFromAdder = async (created) => {
  activeTab.value = 'beverages';
  fabOpen.value = false;
  await nextTick();
  // aspetta un tick aggiuntivo per dare tempo al fetchList di BeverageList
  // di registrarsi (se serve, mergiamo l'elemento nella lista a posteriori).
  beverageListRef.value?.openAdvancedFor?.(created);
  beverageListRef.value?.refresh?.();
};

const isValidTab = (tab) => {
  if (tab === 'list' || tab === 'adder' || tab === 'beverages') return true;
  if (tab === 'pantry') return isOwner.value && isPro.value;
  if (tab === 'ingredients') return !isPro.value;
  return false;
};

const resolveTabFromQuery = (tabParam) => {
  if (isValidTab(tabParam)) return tabParam;
  return 'list';
};

watch(() => route.fullPath, () => {
  if (route.path === '/menu-handler') {
    const tabParam = route.query?.tab;
    if (tabParam && isValidTab(tabParam)) activeTab.value = tabParam;
    else if (!isValidTab(activeTab.value)) activeTab.value = 'list';
  }
});

onMounted(async () => {
  nextTick(() => { document.title = 'Menu · Tavolo'; });
  await verifyPayment();
  try { await store.dispatch('refreshUser'); } catch (_e) { /* fail-soft */ }
  try {
    const billing = await fetchBillingStatus(tkn);
    const plan = String(billing?.subscription_plan || '').toLowerCase();
    if (plan === 'pro' || plan === 'starter') {
      billingPlan.value = plan;
      const u = store.getters.getUser || {};
      if (String(u.subscription_plan || '').toLowerCase() !== plan) {
        const merged = { ...u, subscription_plan: plan };
        store.commit('setUser', merged);
        try { localStorage.setItem('user', JSON.stringify(merged)); } catch (_e) {}
      }
    }
  } catch (_e) { /* fail-soft */ }
  activeTab.value = resolveTabFromQuery(route.query?.tab);
});

watch(isPro, () => {
  if (!isValidTab(activeTab.value)) activeTab.value = 'list';
});

onBeforeUnmount(() => {
  stopSubtitleRotation();
  if (toastTimer) clearTimeout(toastTimer);
});

// Chiude FAB cliccando fuori
const closeFab = (e) => {
  if (fabOpen.value && !e.target.closest('.ms-fab-area')) fabOpen.value = false;
};
onMounted(() => { document.addEventListener('click', closeFab); });
onBeforeUnmount(() => { document.removeEventListener('click', closeFab); });
</script>

<template>
  <AppLayout page-title="Menu">
    <div class="ms-layout">

      <!-- ── Sidebar ── -->
      <aside class="ms-sidebar" v-if="activeTab !== 'adder'">
        <div class="ms-sidebar-section">
          <div class="ms-sidebar-label">Sezione</div>
          <nav class="ms-sidebar-nav">
            <button
              type="button"
              class="ms-nav-item"
              :class="{ 'ms-nav-item--active': activeTab === 'list' }"
              @click="handleList"
            >
              <i class="bi bi-list-ul" aria-hidden="true"></i>
              <span>Tutti gli elementi</span>
              <span v-if="menuElementsCount > 0" class="ms-nav-count">{{ menuElementsCount }}</span>
            </button>

            <button
              type="button"
              class="ms-nav-item"
              :class="{ 'ms-nav-item--active': activeTab === 'beverages' }"
              @click="handleBeverages"
            >
              <i class="bi bi-cup-straw" aria-hidden="true"></i>
              <span>Solo bevande</span>
            </button>

            <button
              v-if="!isPro"
              type="button"
              class="ms-nav-item"
              :class="{ 'ms-nav-item--active': activeTab === 'ingredients' }"
              @click="handleIngredients"
            >
              <i class="bi bi-basket" aria-hidden="true"></i>
              <span>Ingredienti</span>
            </button>

            <button
              v-if="isPro && isOwner"
              type="button"
              class="ms-nav-item"
              :class="{ 'ms-nav-item--active': activeTab === 'pantry' }"
              @click="handlePantry"
            >
              <i class="bi bi-box-seam" aria-hidden="true"></i>
              <span>Magazzino</span>
              <span class="ms-pro-badge">PRO</span>
            </button>
          </nav>
        </div>

        <div class="ms-sidebar-divider"></div>

        <div class="ms-sidebar-section">
          <div class="ms-sidebar-label">Strumenti</div>
          <nav class="ms-sidebar-nav">
            <button
              type="button"
              class="ms-nav-item"
              @click="showHistoryModal = true"
            >
              <i class="bi bi-clock-history" aria-hidden="true"></i>
              <span>Storico ordini</span>
            </button>

            <button
              type="button"
              class="ms-nav-item"
              @click="onRequestImport"
            >
              <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i>
              <span>Importa da PDF/Foto</span>
            </button>

            <button
              v-if="activeTab === 'beverages'"
              type="button"
              class="ms-nav-item"
              @click="showBarShiftModal = true"
            >
              <i class="bi bi-cup-hot" aria-hidden="true"></i>
              <span>Turno bar</span>
            </button>
          </nav>
        </div>
      </aside>

      <!-- ── Main ── -->
      <div class="ms-main">
        <div class="menu-content">
          <MenuAdder
            v-if="activeTab === 'adder'"
            :mode="adderMode"
            @ViewList="adderMode === 'beverage' ? handleBeverages() : handleList()"
            @open-recipe="onOpenRecipeFromAdder"
          />
          <MenuList
            v-else-if="activeTab === 'list'"
            ref="menuListRef"
            @AddElement="handleAdder"
            @RequestImport="onRequestImport"
            @count-changed="onCountChanged"
            @element-updated="onElementUpdated"
          />
          <BeverageList
            v-else-if="activeTab === 'beverages'"
            ref="beverageListRef"
            @AddBeverage="handleAdderFromBeverage"
            @open-bar-shift="showBarShiftModal = true"
          />
          <IngredientsManager v-else-if="activeTab === 'ingredients' && !isPro" />
          <PantryView v-else-if="activeTab === 'pantry' && isPro" />
        </div>
      </div>
    </div>

    <!-- ── FAB quick-add ── -->
    <div class="ms-fab-area" v-if="activeTab !== 'adder'">
      <!-- FAB menu items -->
      <Transition name="fab-menu">
        <div v-if="fabOpen" class="ms-fab-menu" role="menu">
          <button type="button" class="ms-fab-action" role="menuitem" @click="handleAdder">
            <span class="ms-fab-action-icon" aria-hidden="true">🍝</span>
            <span class="ms-fab-action-label">Nuovo piatto</span>
            <kbd class="ms-fab-kbd">P</kbd>
          </button>
          <button type="button" class="ms-fab-action" role="menuitem" @click="handleAdderFromBeverage">
            <span class="ms-fab-action-icon" aria-hidden="true">🍷</span>
            <span class="ms-fab-action-label">Nuova bevanda</span>
            <kbd class="ms-fab-kbd">B</kbd>
          </button>
          <button type="button" class="ms-fab-action" role="menuitem" @click="onRequestImport">
            <span class="ms-fab-action-icon" aria-hidden="true">📷</span>
            <span class="ms-fab-action-label">Importa da foto</span>
            <kbd class="ms-fab-kbd">I</kbd>
          </button>
        </div>
      </Transition>

      <!-- FAB button -->
      <button
        type="button"
        class="ms-fab"
        :class="{ 'ms-fab--open': fabOpen }"
        @click.stop="fabOpen = !fabOpen"
        :aria-label="fabOpen ? 'Chiudi menu' : 'Aggiungi elemento'"
        :aria-expanded="fabOpen"
      >
        <span aria-hidden="true">＋</span>
      </button>
    </div>

    <MenuImporter
      ref="importerRef"
      :current-count="menuElementsCount"
      @loading-start="onImportLoadingStart"
      @loading-end="onImportLoadingEnd"
      @imported="onImported"
      @error="onImportError"
    />

    <!-- Modal Turno bar -->
    <TeleportCompat to="body">
      <Transition name="bar-modal">
        <div
          v-if="showBarShiftModal"
          class="bar-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Turno bar"
          @click.self="showBarShiftModal = false"
        >
          <div class="bar-modal-card">
            <BarShiftPanel mode="modal" @close="showBarShiftModal = false" />
          </div>
        </div>
      </Transition>
    </TeleportCompat>

    <!-- Modal Storico ordini -->
    <TeleportCompat to="body">
      <Transition name="bar-modal">
        <div
          v-if="showHistoryModal"
          class="bar-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Storico ordini"
          @click.self="showHistoryModal = false"
        >
          <div class="bar-modal-card">
            <OrdersHistory mode="modal" @close="showHistoryModal = false" />
          </div>
        </div>
      </Transition>
    </TeleportCompat>

    <!-- Overlay OCR -->
    <TeleportCompat to="body">
      <div v-if="isImporting" class="import-overlay" role="status" aria-live="polite">
        <div class="import-overlay-spinner" aria-hidden="true"></div>
        <h3 class="import-overlay-title">Stiamo analizzando il tuo menu…</h3>
        <p class="import-overlay-subtitle">{{ loadingSubtitles[loadingSubtitleIdx] }}</p>
        <div class="import-overlay-progress">
          <div class="import-overlay-progress-bar"></div>
        </div>
        <p class="import-overlay-warn">
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          Operazione in corso. Non chiudere o ricaricare la pagina.
        </p>
      </div>
    </TeleportCompat>

    <!-- Toast -->
    <TeleportCompat to="body">
      <Transition name="toast">
        <div
          v-if="toast.show"
          class="md-toast"
          :class="toast.type === 'error' ? 'md-toast-error' : 'md-toast-success'"
          role="alert"
        >
          <i :class="['bi', toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill']" aria-hidden="true"></i>
          <span>{{ toast.message }}</span>
          <button type="button" class="import-toast-close" aria-label="Chiudi" @click="toast.show = false">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
      </Transition>
    </TeleportCompat>
  </AppLayout>
</template>

<style scoped>
/* ── Layout ── */
.ms-layout {
  display: flex;
  min-height: calc(100vh - 0px);
  position: relative;
}

/* ── Sidebar ── */
.ms-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--line);
  background: var(--bg-sunk);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ms-sidebar-section { display: flex; flex-direction: column; gap: 2px; }
.ms-sidebar-label {
  padding: 0 8px 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.ms-sidebar-divider {
  height: 1px;
  background: var(--line);
  margin: 10px 8px;
}
.ms-sidebar-nav { display: flex; flex-direction: column; gap: 1px; }

.ms-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--ink-2);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.ms-nav-item:hover { background: var(--bg-hover); color: var(--ink); }
.ms-nav-item--active {
  background: var(--bg-elev);
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
}
.ms-nav-item--active i { color: var(--ac); }
.ms-nav-item i { font-size: 14px; opacity: 0.8; flex-shrink: 0; }
.ms-nav-item span:nth-child(2) { flex: 1; }

.ms-nav-count {
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ms-pro-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--ac-soft);
  color: var(--ac-ink);
  font-family: var(--f-mono);
  flex-shrink: 0;
}

/* ── Main ── */
.ms-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.menu-content { display: flex; flex-direction: column; }

/* ── FAB ── */
.ms-fab-area {
  position: fixed;
  bottom: 28px;
  right: 28px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 100;
}

.ms-fab-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.ms-fab-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  font-family: var(--f-sans);
  white-space: nowrap;
  transition: background var(--dur-fast), box-shadow var(--dur-fast);
}
.ms-fab-action:hover { background: var(--bg-hover); box-shadow: var(--shadow-lg); }
.ms-fab-action-icon { font-size: 16px; flex-shrink: 0; }
.ms-fab-kbd {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-sunk);
  color: var(--ink-3);
  box-shadow: inset 0 -1px 0 var(--line);
}

.ms-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--ink);
  color: var(--bg);
  font-size: 24px;
  font-weight: 300;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform var(--dur), background var(--dur), box-shadow var(--dur);
  line-height: 1;
}
.ms-fab:hover { background: var(--ac); box-shadow: var(--shadow-pop); }
.ms-fab--open { transform: rotate(45deg); }

.fab-menu-enter-active, .fab-menu-leave-active {
  transition: opacity 180ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.fab-menu-enter-from, .fab-menu-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

/* ── Modals ── */
.bar-modal-overlay {
  position: fixed; inset: 0;
  background: color-mix(in oklab, black 50%, transparent);
  backdrop-filter: blur(6px);
  z-index: 450;
  display: flex; align-items: stretch; justify-content: center;
  padding: 24px;
}
.bar-modal-card {
  background: var(--paper);
  border-radius: var(--r-lg);
  max-width: 1240px;
  width: 100%;
  max-height: calc(100vh - 48px);
  overflow: auto;
  box-shadow: var(--shadow-lg);
}
.bar-modal-enter-active, .bar-modal-leave-active { transition: opacity 220ms; }
.bar-modal-enter-active .bar-modal-card, .bar-modal-leave-active .bar-modal-card {
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.bar-modal-enter-from, .bar-modal-leave-to { opacity: 0; }
.bar-modal-enter-from .bar-modal-card, .bar-modal-leave-to .bar-modal-card { transform: translateY(16px); }

/* ── Import overlay ── */
.import-overlay {
  position: fixed; inset: 0;
  background: color-mix(in oklab, black 85%, transparent);
  backdrop-filter: blur(8px);
  z-index: 500;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 24px; color: var(--paper); text-align: center;
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
  width: min(420px, 100%); height: 6px;
  background: color-mix(in oklab, var(--paper) 14%, transparent);
  border-radius: 999px; overflow: hidden; margin-top: 8px;
}
.import-overlay-progress-bar {
  height: 100%; width: 50%;
  background: linear-gradient(90deg, var(--ac), color-mix(in oklab, var(--ac) 60%, var(--paper)));
  border-radius: 999px;
  animation: import-progress 1.6s ease-in-out infinite;
}
@keyframes import-progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.import-overlay-warn {
  margin: 16px 0 0; font-size: 12.5px; opacity: 0.75;
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--f-mono);
}

/* ── Toast ── */
.md-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 600;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: var(--r-md);
  box-shadow: var(--shadow-lg); background: var(--paper);
  border: 1px solid var(--line); font-size: 13.5px;
  font-weight: 500; max-width: 420px;
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

/* ── Responsive ── */
@media (max-width: 860px) {
  .ms-layout { flex-direction: column; }
  .ms-sidebar {
    width: 100%;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--line);
    gap: 6px;
  }
  .ms-sidebar-section { flex-direction: row; flex-wrap: nowrap; gap: 4px; }
  .ms-sidebar-label { display: none; }
  .ms-sidebar-divider { width: 1px; height: auto; margin: 0 6px; }
  .ms-nav-item { white-space: nowrap; padding: 7px 12px; }
  .ms-fab-area { bottom: 96px; right: 16px; }
  .bar-modal-overlay { padding: 0; }
  .bar-modal-card { max-height: 100vh; border-radius: 0; }
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
}
</style>

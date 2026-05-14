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
import TeleportCompat from '@/lib/compat/teleport.js';
import { STAFF_ROLES, staffRole } from '@/staffAccess';

const store = useStore();
const router = useRouter();
const route = useRoute();
const tkn = store.getters.getToken;

const activeTab = ref('list');
// 'dish' (default) per piatti | 'beverage' per bevande — controlla MenuAdder
const adderMode = ref('dish');
const showBarShiftModal = ref(false);

const currentUser = computed(() => store.getters.getUser || null);
const isOwner = computed(() => staffRole(currentUser.value) === STAFF_ROLES.OWNER);
// Fonte autoritativa del piano: /api/billing/status. Lo store puo' avere user
// stale se il backend non ha mai popolato `subscription_plan` su /users/me
// (capita su upgrade Stripe gia avvenuto in DB ma non riflesso al login).
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
    if (response.ok) {
      const data = await response.json();
      if (data.payment_method == null && 0) router.push('/add-payment');
      else if (new Date(data.end_subscription) < new Date() && 0) router.push('/renew-sub');
      else return true;
    }
  } catch (_e) { /* silent */ }
};

const handleAdder = () => {
  adderMode.value = activeTab.value === 'beverages' ? 'beverage' : 'dish';
  activeTab.value = 'adder';
};
const handleAdderFromBeverage = () => {
  adderMode.value = 'beverage';
  activeTab.value = 'adder';
};
const handleList = () => { activeTab.value = 'list'; };
const handleBeverages = () => { activeTab.value = 'beverages'; };
const handleIngredients = () => { activeTab.value = 'ingredients'; };
const handlePantry = () => { activeTab.value = 'pantry'; };

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
  await beverageListRef.value?.refresh?.();
};

const onImportError = (msg) => { showToast('error', msg || "Errore durante l'import."); };

const onCountChanged = (n) => { menuElementsCount.value = Number(n) || 0; };

// Quando un piatto viene modificato (in particolare il flag is_beverage),
// aggiorniamo anche BeverageList cosi' eventuali spostamenti sono riflessi subito.
const onElementUpdated = async () => {
  await nextTick();
  await beverageListRef.value?.refresh?.();
};

// Tab disponibili in base al piano:
//   starter: Piatti | Bevande | Ingredienti
//   pro:     Piatti | Bevande | Magazzino
// Su starter la tab "pantry" non esiste; su pro la tab "ingredients" e' sostituita da "pantry".
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
    if (tabParam && isValidTab(tabParam)) {
      activeTab.value = tabParam;
    } else if (!isValidTab(activeTab.value)) {
      activeTab.value = 'list';
    }
  }
});

onMounted(async () => {
  nextTick(() => { document.title = 'Menu · Tavolo'; });
  await verifyPayment();
  // Riallinea user da /users/me + billing/status PRIMA di scegliere la tab.
  // billing/status e' la fonte autoritativa del piano: se la sub e' attiva
  // sul DB di Stripe (gestito dal backend), arriva anche se il campo user
  // e' rimasto vuoto su una vecchia sessione.
  try { await store.dispatch('refreshUser'); } catch (_e) { /* fail-soft */ }
  try {
    const billing = await fetchBillingStatus(tkn);
    const plan = String(billing?.subscription_plan || '').toLowerCase();
    if (plan === 'pro' || plan === 'starter') {
      billingPlan.value = plan;
      // Allinea anche lo store cosi' altri componenti vedono il piano giusto
      // (es. canSeeBarManagement per cucina starter).
      const u = store.getters.getUser || {};
      if (String(u.subscription_plan || '').toLowerCase() !== plan) {
        const merged = { ...u, subscription_plan: plan };
        store.commit('setUser', merged);
        try { localStorage.setItem('user', JSON.stringify(merged)); } catch (_e) {}
      }
    }
  } catch (_e) { /* fail-soft: lascio il fallback su currentUser */ }
  activeTab.value = resolveTabFromQuery(route.query?.tab);
});

// Se il piano cambia in sessione (es. dopo upgrade Stripe) la tab attiva
// potrebbe diventare non piu' valida — fallback a 'list'.
watch(isPro, () => {
  if (!isValidTab(activeTab.value)) {
    activeTab.value = 'list';
  }
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
          <button
            v-if="activeTab === 'beverages'"
            type="button"
            class="btn btn-sm"
            @click="showBarShiftModal = true"
          >
            <i class="bi bi-cup-hot"></i><span>Turno bar</span>
          </button>
          <button v-if="activeTab === 'list'" type="button" class="btn btn-sm" @click="onRequestImport">
            <i class="bi bi-upload"></i><span>Importa</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" @click="handleAdder">
            <i class="bi bi-plus-lg"></i><span>{{ activeTab === 'beverages' ? 'Nuova bevanda' : 'Nuovo piatto' }}</span>
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
          :class="{ active: activeTab === 'beverages' }"
          @click="handleBeverages"
        >
          <i class="bi bi-cup-straw"></i> Bevande
        </button>
        <button
          v-if="!isPro"
          type="button"
          class="pf-tab"
          :class="{ active: activeTab === 'ingredients' }"
          @click="handleIngredients"
        >
          <i class="bi bi-basket"></i> Ingredienti
        </button>
        <button
          v-if="isPro && isOwner"
          type="button"
          class="pf-tab"
          :class="{ active: activeTab === 'pantry' }"
          @click="handlePantry"
        >
          <i class="bi bi-box-seam"></i> Magazzino
        </button>
      </div>

      <div class="menu-content">
        <MenuAdder v-if="activeTab === 'adder'" :mode="adderMode" @ViewList="adderMode === 'beverage' ? handleBeverages() : handleList()" />
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
        />
        <IngredientsManager v-else-if="activeTab === 'ingredients' && !isPro" />
        <PantryView v-else-if="activeTab === 'pantry' && isPro" />
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

    <!-- Modal Turno bar — accessibile dalla tab Bevande per owner/gestione -->
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

    <!-- Overlay loading full-screen durante l'analisi OCR -->
    <TeleportCompat to="body">
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
    </TeleportCompat>

    <TeleportCompat to="body">
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
    </TeleportCompat>
  </AppLayout>
</template>

<style scoped>
.menu-content { display: flex; flex-direction: column; gap: 16px; }

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

@media (max-width: 860px) {
  .bar-modal-overlay { padding: 0; }
  .bar-modal-card { max-height: 100vh; border-radius: 0; }
}

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

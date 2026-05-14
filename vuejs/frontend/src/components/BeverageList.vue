<script setup>
// Lista delle bevande (Element con is_beverage=true).
// Usata da MenuSetter tab "Bevande" (sempre, tutti i piani).
//
// - Mostra le bevande con badge categoria + prezzo.
// - Toggle inline `is_beverage_advanced`: disponibile a tutti i piani
//   (starter + pro). Click su toggle:
//     - off → on: setta is_beverage_advanced=true e apre l'editor ricetta
//     - on  → apre l'editor ricetta per modificare i dosaggi (senza disattivare).
//   La disattivazione avviene tramite bottone "Disattiva" dentro l'editor stesso.
// - "Sposta nei piatti": toglie il flag is_beverage.
// - L'editor (BeverageAdvancedEditor) salva ElementIngredient con qty_per_serving.

import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';
import Skeleton from '@/components/Skeleton.vue';
import BeverageAdvancedEditor from '@/components/BeverageAdvancedEditor.vue';

const store = useStore();
const tkn = store.getters.getToken;

const emit = defineEmits(['AddBeverage', 'count-changed']);

const list = ref([]);
const initialLoading = ref(true);
const togglingId = ref(null);
const searchQuery = ref('');
const error = ref('');
const showAdvancedEditor = ref(false);
const advancedTarget = ref(null);

const filtered = computed(() => {
  if (!searchQuery.value) return list.value;
  const q = searchQuery.value.toLowerCase();
  return list.value.filter((el) => String(el.name || '').toLowerCase().includes(q));
});

const advancedCount = computed(() => list.value.filter((el) => el.is_beverage_advanced).length);

const readErrorMessage = async (response, fallback) => {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || payload?.message || fallback;
};

const fetchList = async () => {
  initialLoading.value = true;
  error.value = '';
  try {
    const response = await fetch(`${API_BASE}/api/menus`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response, 'Errore nel recupero del menu.'));
    const data = await response.json();
    const elements = data?.data?.[0]?.fk_elements || [];
    // Filtra solo bevande (flag esplicito is_beverage).
    list.value = elements.filter((el) => el.is_beverage === true);
    emit('count-changed', list.value.length);
  } catch (e) {
    console.error(e);
    error.value = e.message || 'Errore caricamento.';
  } finally {
    initialLoading.value = false;
  }
};

const patchElement = async (documentId, dataPatch) => {
  const response = await fetch(`${API_BASE}/api/elements/${documentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
    body: JSON.stringify({ data: dataPatch }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, 'Aggiornamento non riuscito.'));
};

// Click sul toggle "avanzata":
//   - se gia attivo → apre l'editor per modificare la ricetta (no disattivazione qui;
//     l'utente puo' disattivare dall'interno dell'editor con il bottone dedicato).
//   - se inattivo  → setta il flag e apre l'editor per inserire i dosaggi iniziali.
const toggleAdvanced = async (el) => {
  if (togglingId.value) return;
  if (el.is_beverage_advanced) {
    advancedTarget.value = el;
    showAdvancedEditor.value = true;
    return;
  }
  togglingId.value = el.documentId;
  try {
    await patchElement(el.documentId, { is_beverage_advanced: true });
    el.is_beverage_advanced = true;
    advancedTarget.value = el;
    showAdvancedEditor.value = true;
  } catch (e) {
    error.value = e.message || 'Errore aggiornamento.';
  } finally {
    togglingId.value = null;
  }
};

// Callback dall'editor quando l'utente chiede di disattivare la gestione avanzata.
// L'editor patcha is_beverage_advanced=false ma preserva le ElementIngredient
// (cosi' riattivare in futuro non perde i dosaggi).
const onAdvancedDeactivated = (el) => {
  const target = list.value.find((x) => x.documentId === el.documentId);
  if (target) target.is_beverage_advanced = false;
  showAdvancedEditor.value = false;
  advancedTarget.value = null;
};

const removeBeverageFlag = async (el) => {
  if (togglingId.value) return;
  togglingId.value = el.documentId;
  try {
    await patchElement(el.documentId, { is_beverage: false, is_beverage_advanced: false });
    list.value = list.value.filter((x) => x.documentId !== el.documentId);
    emit('count-changed', list.value.length);
  } catch (e) {
    error.value = e.message || 'Errore aggiornamento.';
  } finally {
    togglingId.value = null;
  }
};

const handleDelete = async (el) => {
  if (!confirm(`Eliminare definitivamente "${el.name}"?`)) return;
  togglingId.value = el.documentId;
  try {
    const response = await fetch(`${API_BASE}/api/elements/${el.documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tkn}` },
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(await readErrorMessage(response, 'Eliminazione non riuscita.'));
    }
    list.value = list.value.filter((x) => x.documentId !== el.documentId);
    emit('count-changed', list.value.length);
  } catch (e) {
    error.value = e.message || 'Eliminazione non riuscita.';
  } finally {
    togglingId.value = null;
  }
};

onMounted(fetchList);

defineExpose({ refresh: fetchList });
</script>

<template>
  <div class="bev-page">
    <div class="bev-container">

      <!-- Header -->
      <div class="bev-header">
        <div class="bev-header-left">
          <h2 class="bev-title">Bevande</h2>
          <span v-if="list.length > 0" class="ds-badge ds-badge-primary">{{ list.length }}</span>
          <span v-if="advancedCount > 0" class="ds-badge ds-badge-success">
            <i class="bi bi-stars"></i> {{ advancedCount }} avanzate
          </span>
        </div>
        <div class="bev-header-actions">
          <button class="ds-btn ds-btn-secondary" :disabled="initialLoading" @click="fetchList">
            <i class="bi" :class="initialLoading ? 'bi-arrow-repeat bev-spin' : 'bi-arrow-clockwise'"></i>
            <span>Aggiorna</span>
          </button>
          <button class="ds-btn ds-btn-primary" @click="emit('AddBeverage')">
            <i class="bi bi-plus-lg"></i>
            <span>Nuova bevanda</span>
          </button>
        </div>
      </div>

      <!-- Info banner -->
      <div class="ds-card bev-info-banner">
        <i class="bi bi-info-circle bev-info-icon"></i>
        <p class="bev-info-text">
          Le bevande in scheda <strong>bar</strong> vengono conteggiate al turno per stimare quante
          bottiglie servono al rifornimento. Attiva la <strong>gestione avanzata</strong> per
          cocktail, calici di vino e drink miscelati: indica capacita unita e dose per porzione,
          il sistema calcola da solo le unita consumate.
        </p>
      </div>

      <!-- Error -->
      <div v-if="error" class="ds-card bev-error">
        <i class="bi bi-exclamation-triangle"></i>
        <span>{{ error }}</span>
        <button class="ds-btn ds-btn-secondary ds-btn-sm" @click="fetchList">Riprova</button>
      </div>

      <!-- Filters -->
      <div v-if="list.length > 0" class="ds-card bev-filters">
        <div class="bev-filters-inner">
          <div class="filter-search">
            <i class="bi bi-search filter-icon"></i>
            <input
              v-model="searchQuery"
              type="text"
              class="ds-input filter-input"
              placeholder="Cerca bevanda..."
            >
          </div>
        </div>
      </div>

      <!-- Skeleton -->
      <div v-if="initialLoading" class="bev-list">
        <div v-for="n in 4" :key="`sk-bev-${n}`" class="ds-card bev-item">
          <Skeleton width="60%" height="18px" radius="4px" />
          <Skeleton width="40%" height="14px" radius="4px" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="list.length === 0" class="ds-card">
        <div class="ds-empty">
          <div class="ds-empty-icon"><i class="bi bi-cup-straw"></i></div>
          <p class="ds-empty-title">Nessuna bevanda in scheda bar</p>
          <p class="ds-empty-description">
            Aggiungi acqua, vino, lattine, cocktail. Le voci del menu con categorie
            tipo "Bevande", "Vini", "Cocktail" possono essere marcate come bevanda
            anche dalla scheda Piatti.
          </p>
          <button class="ds-btn ds-btn-primary" @click="emit('AddBeverage')">
            <i class="bi bi-plus-lg"></i>
            <span>Aggiungi la prima bevanda</span>
          </button>
        </div>
      </div>

      <!-- List -->
      <div v-else class="bev-list">
        <div
          v-for="el in filtered"
          :key="el.documentId"
          class="ds-card bev-item"
          :class="{ 'bev-item--advanced': el.is_beverage_advanced }"
        >
          <div class="bev-item-main">
            <div class="bev-item-info">
              <div class="bev-item-name-row">
                <span class="bev-item-name">{{ el.name }}</span>
                <span v-if="el.category" class="ds-badge ds-badge-soft">{{ el.category }}</span>
                <span v-if="el.is_beverage_advanced" class="ds-badge ds-badge-success">
                  <i class="bi bi-stars"></i> Avanzata
                </span>
              </div>
              <div class="bev-item-meta">
                <span class="bev-item-price">{{ Number(el.price || 0).toFixed(2) }} &euro;</span>
                <span v-if="!el.available" class="ds-badge ds-badge-danger ds-badge-sm">Non disponibile</span>
              </div>
            </div>
            <div class="bev-item-actions">
              <button
                type="button"
                class="bev-toggle"
                :class="{ 'bev-toggle--active': el.is_beverage_advanced }"
                :title="el.is_beverage_advanced ? 'Modifica la ricetta avanzata' : 'Attiva gestione avanzata (cocktail/calici)'"
                :disabled="togglingId !== null"
                @click="toggleAdvanced(el)"
              >
                <i v-if="togglingId === el.documentId" class="bi bi-arrow-repeat bev-spin"></i>
                <template v-else>
                  <i v-if="el.is_beverage_advanced" class="bi bi-stars bev-toggle-icon-on"></i>
                  <i v-else class="bi bi-circle bev-toggle-icon-off"></i>
                </template>
                <span class="bev-toggle-text">{{ el.is_beverage_advanced ? 'Avanzata · Modifica' : 'Avanzata' }}</span>
              </button>
              <button
                type="button"
                class="ds-btn ds-btn-ghost ds-btn-sm"
                :title="`Rimuovi dalla scheda bar (resta nei piatti, categoria ${el.category || 'libera'})`"
                :disabled="togglingId !== null"
                @click="removeBeverageFlag(el)"
              >
                <i class="bi bi-arrow-down-circle"></i>
                <span class="bev-action-text">Sposta nei piatti</span>
              </button>
              <button
                type="button"
                class="ds-btn ds-btn-ghost ds-btn-sm bev-btn-danger"
                :disabled="togglingId !== null"
                @click="handleDelete(el)"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Editor ricetta avanzata: disponibile su tutti i piani -->
    <BeverageAdvancedEditor
      v-if="showAdvancedEditor && advancedTarget"
      :element="advancedTarget"
      @cancel="showAdvancedEditor = false"
      @deactivated="onAdvancedDeactivated"
      @done="showAdvancedEditor = false; fetchList()"
    />
  </div>
</template>

<style scoped>
.bev-page { padding: var(--space-8) 0; }
.bev-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.bev-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.bev-header-left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.bev-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  letter-spacing: var(--tracking-tight);
}
.bev-header-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

.bev-info-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-subtle);
  border-left: 3px solid var(--color-primary);
}
.bev-info-icon { color: var(--color-primary); font-size: var(--text-lg); flex-shrink: 0; margin-top: 2px; }
.bev-info-text { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; line-height: 1.5; }

.bev-error {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4);
  color: var(--color-destructive); font-size: var(--text-sm);
}

.bev-filters { padding: var(--space-4); }
.bev-filters-inner { display: flex; gap: var(--space-3); }
.filter-search { flex: 1; position: relative; }
.filter-icon {
  position: absolute; left: var(--space-3); top: 50%; transform: translateY(-50%);
  color: var(--color-text-muted); font-size: var(--text-sm);
}
.filter-input { padding-left: 36px; }

.bev-list { display: flex; flex-direction: column; gap: var(--space-3); }
.bev-item { padding: var(--space-4); transition: opacity var(--transition-fast); }
.bev-item--advanced { border-left: 3px solid var(--color-success, #16a34a); }

.bev-item-main { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.bev-item-info { flex: 1; min-width: 0; }
.bev-item-name-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-1); }
.bev-item-name { font-size: var(--text-md); font-weight: 600; color: var(--color-text); }
.bev-item-meta { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
.bev-item-price { font-weight: 600; color: var(--color-text); }

.bev-item-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.bev-action-text { display: inline; }

.bev-toggle {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-sm); font-weight: 500;
  border: 1.5px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
  flex-shrink: 0;
}
.bev-toggle:hover:not(:disabled) { border-color: var(--color-success, #16a34a); }
.bev-toggle--active {
  background: color-mix(in oklab, var(--color-success, #16a34a) 12%, var(--color-bg));
  border-color: var(--color-success, #16a34a);
  color: var(--color-success, #16a34a);
}
.bev-toggle:disabled { cursor: not-allowed; opacity: 0.7; }
.bev-toggle-icon-on { color: var(--color-success, #16a34a); }
.bev-toggle-icon-off { color: var(--color-text-muted); }

.bev-btn-danger:hover { color: var(--color-destructive); }
.bev-spin { animation: bev-spin 0.8s linear infinite; display: inline-block; }
@keyframes bev-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .bev-container { padding: 0 var(--space-4); }
  .bev-item-main { flex-direction: column; align-items: stretch; }
  .bev-item-actions { width: 100%; }
  .bev-action-text { display: none; }
}
</style>

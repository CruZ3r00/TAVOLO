<script setup>
// Editor ricetta avanzata per una bevanda (is_beverage_advanced=true).
// Permette di inserire per ogni ingrediente:
//   - Capacita unita (es. 750 ml per una bottiglia di gin)
//   - Uso per porzione (es. 20 ml per un Negroni)
//
// Use case: cocktail, vini al calice, drink miscelati. Il sistema calcola
// `units_consumed = ceil(somma_uso_turno / capacita_unita)` per ogni bottiglia
// alla chiusura del turno bar.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import {
  API_BASE,
  fetchElementRecipe,
  setElementRecipe,
  inventoryErrorMessage,
} from '@/utils';

const props = defineProps({
  element: { type: Object, required: true },
});
const emit = defineEmits(['cancel', 'done', 'deactivated']);

const deactivating = ref(false);

const store = useStore();
const token = computed(() => store.getters.getToken);

const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const rows = ref([]);

const loadAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    const recipe = await fetchElementRecipe(token.value, props.element.documentId);
    rows.value = recipe.map((r) => ({
      name: r.ingredient.name,
      unit: r.ingredient.unit || 'ml',
      unit_size: r.ingredient.unit_size !== null ? String(r.ingredient.unit_size) : '',
      qty_per_serving: r.qty_per_serving > 0 ? String(r.qty_per_serving) : '',
    }));
    if (rows.value.length === 0) {
      rows.value.push({ name: '', unit: 'ml', unit_size: '', qty_per_serving: '' });
    }
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const addRow = () => {
  rows.value.push({ name: '', unit: 'ml', unit_size: '', qty_per_serving: '' });
};

const removeRow = (idx) => {
  rows.value.splice(idx, 1);
};

const onSubmit = async () => {
  // Validazione: ogni riga deve avere name + qty > 0
  const recipe = [];
  for (let i = 0; i < rows.value.length; i += 1) {
    const r = rows.value[i];
    const name = String(r.name || '').trim();
    if (!name) continue; // skip empty rows
    const qty = Number(r.qty_per_serving);
    if (!Number.isFinite(qty) || qty <= 0) {
      error.value = `Riga ${i + 1}: uso per porzione non valido.`;
      return;
    }
    const item = { name, unit: r.unit, qty_per_serving: qty };
    if (r.unit_size !== '' && Number.isFinite(Number(r.unit_size))) {
      item.unit_size = Number(r.unit_size);
    }
    recipe.push(item);
  }
  if (recipe.length === 0) {
    error.value = 'Aggiungi almeno un ingrediente.';
    return;
  }

  submitting.value = true;
  error.value = '';
  try {
    await setElementRecipe(token.value, props.element.documentId, recipe);
    emit('done');
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

const onDeactivate = async () => {
  if (deactivating.value || submitting.value) return;
  if (!confirm('Disattivare la gestione avanzata? I dosaggi resteranno salvati e saranno disponibili se la riattivi.')) {
    return;
  }
  deactivating.value = true;
  error.value = '';
  try {
    const resp = await fetch(`${API_BASE}/api/elements/${props.element.documentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${store.getters.getToken}`,
      },
      body: JSON.stringify({ data: { is_beverage_advanced: false } }),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null);
      throw new Error(payload?.error?.message || 'Disattivazione non riuscita.');
    }
    emit('deactivated', props.element);
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    deactivating.value = false;
  }
};

let savedOverflow = '';
onMounted(() => {
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  loadAll();
});
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
</script>

<template>
  <TeleportCompat to="body">
    <div class="bae-overlay" role="dialog" aria-modal="true" @click.self="!submitting && emit('cancel')">
      <div class="bae-card">
        <header class="bae-head">
          <div>
            <h3><i class="bi bi-stars"></i> Ricetta avanzata: {{ element.name }}</h3>
            <p class="bae-sub">
              Per ogni ingrediente: <strong>capacita unita</strong> (es. 750ml = bottiglia)
              e <strong>uso per porzione</strong> (es. 20ml per un Negroni).
              Il sistema scarica una "unita" ogni volta che il consumo totale
              del turno raggiunge un multiplo della capacita.
            </p>
          </div>
          <button class="bae-close" :disabled="submitting" @click="emit('cancel')" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>

        <section class="bae-body">
          <div v-if="loading" class="bae-loading">
            <i class="bi bi-arrow-repeat bae-spin"></i> Caricamento ricetta...
          </div>
          <template v-else>
            <div v-for="(row, idx) in rows" :key="idx" class="bae-row">
              <div class="bae-row-fields">
                <label class="ds-field bae-name-field">
                  <span class="ds-label">Ingrediente</span>
                  <input
                    v-model="row.name"
                    type="text"
                    class="ds-input"
                    placeholder="Es. Gin Tanqueray"
                    :disabled="submitting"
                  >
                </label>
                <label class="ds-field bae-small-field">
                  <span class="ds-label">Unita</span>
                  <select v-model="row.unit" class="ds-input ds-select" :disabled="submitting">
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="pz">pz</option>
                  </select>
                </label>
                <label class="ds-field bae-small-field">
                  <span class="ds-label">Capacita unita</span>
                  <input
                    v-model="row.unit_size"
                    type="number"
                    min="0"
                    step="0.01"
                    class="ds-input"
                    placeholder="750"
                    :disabled="submitting"
                  >
                </label>
                <label class="ds-field bae-small-field">
                  <span class="ds-label">Uso per porzione</span>
                  <input
                    v-model="row.qty_per_serving"
                    type="number"
                    min="0"
                    step="0.01"
                    class="ds-input"
                    placeholder="20"
                    :disabled="submitting"
                  >
                </label>
                <button
                  type="button"
                  class="ds-btn ds-btn-ghost ds-btn-icon bae-remove"
                  :disabled="submitting"
                  @click="removeRow(idx)"
                  aria-label="Rimuovi"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
            </div>

            <button
              type="button"
              class="ds-btn ds-btn-ghost ds-btn-sm bae-add"
              :disabled="submitting"
              @click="addRow"
            >
              <i class="bi bi-plus-lg"></i>
              <span>Aggiungi ingrediente</span>
            </button>

            <p v-if="error" class="bae-error">
              <i class="bi bi-exclamation-circle"></i>
              <span>{{ error }}</span>
            </p>

            <p class="bae-tip">
              <i class="bi bi-lightbulb"></i>
              Esempio Negroni: 3 ingredienti (Gin / Campari / Vermouth), capacita 750ml ciascuno,
              uso 20ml ciascuno per porzione. 5 negroni serviti = 100ml × 3 → 1 unita di ognuna.
            </p>
          </template>
        </section>

        <footer class="bae-foot">
          <button
            class="ds-btn ds-btn-ghost bae-deactivate"
            :disabled="submitting || deactivating || loading"
            @click="onDeactivate"
            title="Disattiva la gestione avanzata (i dosaggi restano salvati)"
          >
            <i v-if="deactivating" class="bi bi-arrow-repeat bae-spin"></i>
            <i v-else class="bi bi-toggle-off"></i>
            <span>Disattiva avanzata</span>
          </button>
          <div class="bae-foot-spacer"></div>
          <button class="ds-btn ds-btn-ghost" :disabled="submitting || deactivating" @click="emit('cancel')">Annulla</button>
          <button class="ds-btn ds-btn-primary" :disabled="submitting || deactivating || loading" @click="onSubmit">
            <i v-if="submitting" class="bi bi-arrow-repeat bae-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Salva ricetta</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.bae-overlay { position: fixed; inset: 0; z-index: 8500; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.bae-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 720px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.bae-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); gap: 12px; }
.bae-head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.bae-head h3 i { color: var(--color-success, #16a34a); margin-right: 6px; }
.bae-sub { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
.bae-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.bae-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.bae-loading { padding: 24px; text-align: center; color: var(--color-text-muted); }

.bae-row { padding: 10px; background: var(--color-bg-subtle); border-radius: 8px; }
.bae-row-fields { display: grid; grid-template-columns: 1.6fr 0.7fr 0.9fr 0.9fr auto; gap: 8px; align-items: end; }
.ds-field { display: flex; flex-direction: column; gap: 4px; position: relative; }
.ds-label { font-size: 11px; font-weight: 500; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.bae-name-field { min-width: 160px; }
.bae-small-field { min-width: 70px; }
.bae-remove { align-self: end; }

.bae-add { align-self: flex-start; }

.bae-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; margin: 0; }
.bae-tip { display: flex; gap: 8px; align-items: flex-start; padding: 10px; background: var(--color-bg-subtle); border-radius: 6px; font-size: 12px; color: var(--color-text-muted); margin: 0; }
.bae-tip i { color: var(--color-warning, #d97706); flex-shrink: 0; margin-top: 2px; }

.bae-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; align-items: center; gap: 8px; background: var(--color-bg-subtle); flex-wrap: wrap; }
.bae-foot-spacer { flex: 1; }
.bae-deactivate { color: var(--color-destructive); }
.bae-deactivate:hover:not(:disabled) { background: color-mix(in oklab, var(--color-destructive) 8%, transparent); }
.bae-spin { animation: bae-spin 0.8s linear infinite; display: inline-block; }
@keyframes bae-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  .bae-row-fields { grid-template-columns: 1fr 1fr; }
  .bae-name-field { grid-column: 1 / -1; }
}
</style>

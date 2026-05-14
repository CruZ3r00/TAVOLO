<script setup>
// Modale "Nuovo rifornimento": registra un carico multi-ingrediente con
// costo totale dell'acquisto. Gli ingredienti si selezionano da quelli
// gia presenti nel magazzino (typeahead). Per crearne di nuovi si passa
// dalla scheda menu (MenuAdder), come richiesto dal flusso.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import { restockBatch, inventoryErrorMessage } from '@/utils';

const props = defineProps({
  ingredients: { type: Array, required: true },
});
const emit = defineEmits(['cancel', 'done']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const rows = ref([newRow()]);
const totalCost = ref('');
const note = ref('');
const submitting = ref(false);
const error = ref('');

function newRow() {
  return { query: '', ingredient: null, qty: '', focused: false };
}

const addRow = () => rows.value.push(newRow());
const removeRow = (idx) => {
  if (rows.value.length <= 1) return;
  rows.value.splice(idx, 1);
};

const ingredientsByKey = computed(() => {
  const m = new Map();
  for (const ing of props.ingredients || []) {
    if (ing && ing.documentId) m.set(ing.documentId, ing);
  }
  return m;
});

const filteredSuggestions = (row) => {
  const q = String(row.query || '').trim().toLowerCase();
  if (!q) return (props.ingredients || []).slice(0, 6);
  return (props.ingredients || [])
    .filter((i) => i && typeof i.name === 'string' && i.name.toLowerCase().includes(q))
    .slice(0, 6);
};

const selectIngredient = (row, ing) => {
  row.ingredient = ing;
  row.query = ing.name;
  row.focused = false;
};

const clearIngredient = (row) => {
  row.ingredient = null;
  row.query = '';
};

const onSubmit = async () => {
  error.value = '';
  const items = [];
  const seen = new Set();
  for (let i = 0; i < rows.value.length; i += 1) {
    const r = rows.value[i];
    if (!r.ingredient) continue;
    if (seen.has(r.ingredient.documentId)) {
      error.value = `Ingrediente duplicato: ${r.ingredient.name}.`;
      return;
    }
    seen.add(r.ingredient.documentId);
    const qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      error.value = `Riga ${i + 1}: quantita non valida.`;
      return;
    }
    items.push({ ingredient_id: r.ingredient.documentId, qty });
  }
  if (items.length === 0) {
    error.value = 'Aggiungi almeno un ingrediente.';
    return;
  }
  const costRaw = String(totalCost.value || '').trim();
  let totalCostNum = null;
  if (costRaw !== '') {
    const c = Number(costRaw.replace(',', '.'));
    if (!Number.isFinite(c) || c < 0) {
      error.value = 'Costo totale non valido.';
      return;
    }
    totalCostNum = c;
  }
  const noteVal = note.value.trim() || null;

  submitting.value = true;
  try {
    await restockBatch(token.value, items, totalCostNum, noteVal);
    emit('done');
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

const validCount = computed(() => rows.value.filter((r) => r.ingredient && Number(r.qty) > 0).length);

let savedOverflow = '';
onMounted(() => { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; });
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
</script>

<template>
  <TeleportCompat to="body">
    <div class="nr-overlay" role="dialog" aria-modal="true" @click.self="!submitting && emit('cancel')">
      <div class="nr-card">
        <header class="nr-head">
          <div>
            <h3><i class="bi bi-arrow-down-circle"></i> Nuovo rifornimento</h3>
            <p class="nr-sub">
              Seleziona gli ingredienti acquistati, la quantita per ognuno e il costo totale.
              Le quantita si registrano nell'unita di misura definita nella scheda ingrediente.
            </p>
          </div>
          <button class="nr-close" :disabled="submitting" @click="emit('cancel')" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>

        <section class="nr-body">
          <div v-if="!ingredients || ingredients.length === 0" class="nr-empty">
            <i class="bi bi-info-circle"></i>
            Nessun ingrediente disponibile. Aggiungi prima gli ingredienti nella scheda Menu, come parte della ricetta di un piatto o bevanda.
          </div>
          <template v-else>
            <div v-for="(row, idx) in rows" :key="idx" class="nr-row">
              <div class="nr-row-fields">
                <div class="nr-field nr-field-ingredient">
                  <label class="nr-label">Ingrediente</label>
                  <div class="nr-combo">
                    <input
                      v-model="row.query"
                      type="text"
                      class="ds-input"
                      placeholder="Cerca..."
                      :disabled="submitting"
                      @focus="row.focused = true"
                      @blur="setTimeout(() => { row.focused = false; }, 180)"
                      @input="row.ingredient = null"
                    >
                    <button
                      v-if="row.ingredient"
                      type="button"
                      class="nr-combo-clear"
                      :disabled="submitting"
                      @click="clearIngredient(row)"
                      aria-label="Pulisci"
                    >
                      <i class="bi bi-x-lg"></i>
                    </button>
                    <div v-if="row.focused && filteredSuggestions(row).length > 0" class="nr-dropdown">
                      <button
                        v-for="ing in filteredSuggestions(row)"
                        :key="ing.documentId"
                        type="button"
                        class="nr-dropdown-item"
                        @mousedown.prevent="selectIngredient(row, ing)"
                      >
                        <span class="nr-dropdown-name">{{ ing.name }}</span>
                        <span class="nr-dropdown-meta">
                          stock {{ Number(ing.stock_qty || 0) }} {{ ing.unit }}
                        </span>
                      </button>
                    </div>
                    <div v-else-if="row.focused && row.query" class="nr-dropdown nr-dropdown-empty">
                      Nessuna corrispondenza. Aggiungi questo ingrediente dalla scheda Menu di un piatto.
                    </div>
                  </div>
                </div>
                <div class="nr-field nr-field-qty">
                  <label class="nr-label">
                    Quantita
                    <span v-if="row.ingredient" class="nr-unit-hint">({{ row.ingredient.unit }})</span>
                  </label>
                  <input
                    v-model="row.qty"
                    type="number"
                    min="0.01"
                    step="0.01"
                    class="ds-input"
                    :disabled="submitting || !row.ingredient"
                    placeholder="0"
                  >
                </div>
                <button
                  type="button"
                  class="ds-btn ds-btn-ghost ds-btn-icon nr-row-remove"
                  :disabled="submitting || rows.length <= 1"
                  @click="removeRow(idx)"
                  aria-label="Rimuovi"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
            </div>

            <button
              type="button"
              class="ds-btn ds-btn-ghost ds-btn-sm nr-add"
              :disabled="submitting"
              @click="addRow"
            >
              <i class="bi bi-plus-lg"></i>
              <span>Aggiungi ingrediente</span>
            </button>

            <div class="nr-row-summary">
              <div class="nr-field">
                <label class="nr-label">Costo totale (€)</label>
                <input
                  v-model="totalCost"
                  type="number"
                  min="0"
                  step="0.01"
                  class="ds-input"
                  :disabled="submitting"
                  placeholder="Es. 48.50"
                >
                <p class="nr-hint">
                  Verra' distribuito proporzionalmente alle quantita inserite.
                </p>
              </div>
              <div class="nr-field">
                <label class="nr-label">Nota (opzionale)</label>
                <textarea
                  v-model="note"
                  class="ds-input"
                  :disabled="submitting"
                  maxlength="500"
                  rows="2"
                  placeholder="Es. Fornitore Bianchi, fattura #2031"
                ></textarea>
              </div>
            </div>

            <div v-if="error" class="nr-error">
              <i class="bi bi-exclamation-circle"></i>
              <span>{{ error }}</span>
            </div>
          </template>
        </section>

        <footer class="nr-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="emit('cancel')">Annulla</button>
          <button
            class="ds-btn ds-btn-primary"
            :disabled="submitting || validCount === 0"
            @click="onSubmit"
          >
            <i v-if="submitting" class="bi bi-arrow-repeat nr-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Registra rifornimento</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.nr-overlay { position: fixed; inset: 0; z-index: 8500; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.nr-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 720px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.nr-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); gap: 12px; }
.nr-head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.nr-head h3 i { color: var(--color-primary); margin-right: 6px; }
.nr-sub { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
.nr-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.nr-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.nr-empty { padding: 16px; background: var(--color-bg-subtle); border-radius: 8px; font-size: 13px; color: var(--color-text-muted); display: flex; gap: 8px; }

.nr-row { padding: 10px; background: var(--color-bg-subtle); border-radius: 8px; }
.nr-row-fields { display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; align-items: end; }
.nr-field { display: flex; flex-direction: column; gap: 4px; position: relative; }
.nr-label { font-size: 11px; font-weight: 500; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.nr-unit-hint { color: var(--color-primary); text-transform: none; font-weight: 600; }

.nr-combo { position: relative; }
.nr-combo-clear { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.nr-dropdown { position: absolute; left: 0; right: 0; top: 100%; background: var(--color-bg, #fff); border: 1px solid var(--color-border); border-radius: 6px; box-shadow: 0 8px 16px rgba(0,0,0,0.15); margin-top: 2px; z-index: 10; max-height: 220px; overflow-y: auto; }
.nr-dropdown-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: transparent; text-align: left; cursor: pointer; font-size: 13px; }
.nr-dropdown-item:hover { background: var(--color-bg-subtle); }
.nr-dropdown-name { font-weight: 500; }
.nr-dropdown-meta { color: var(--color-text-muted); font-size: 11px; }
.nr-dropdown-empty { padding: 10px; font-size: 12px; color: var(--color-text-muted); font-style: italic; }

.nr-row-remove { align-self: end; }
.nr-add { align-self: flex-start; }
.nr-row-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 4px; border-top: 1px dashed var(--color-border); margin-top: 4px; padding-top: 14px; }
.nr-hint { margin: 2px 0 0; font-size: 11px; color: var(--color-text-muted); }
.nr-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; }
.nr-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: var(--color-bg-subtle); }
.nr-spin { animation: nr-spin 0.8s linear infinite; display: inline-block; }
@keyframes nr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .nr-row-fields { grid-template-columns: 1fr; }
  .nr-row-remove { justify-self: end; }
  .nr-row-summary { grid-template-columns: 1fr; }
}
</style>

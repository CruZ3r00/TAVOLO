<script setup>
// Registra carico di un Ingredient: qty, costo opzionale, nota.
// Crea un movement kind=restock + auto-dismissa eventuali alert per
// quell'ingrediente.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import { restockIngredient, inventoryErrorMessage } from '@/utils';

const props = defineProps({
  ingredient: { type: Object, required: true },
});
const emit = defineEmits(['cancel', 'done']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const qty = ref('');
const cost = ref('');
const note = ref('');
const submitting = ref(false);
const error = ref('');

const newStockPreview = computed(() => {
  const n = Number(qty.value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (Number(props.ingredient.stock_qty || 0) + n).toFixed(2);
});

const onSubmit = async () => {
  const n = Number(qty.value);
  if (!Number.isFinite(n) || n <= 0) {
    error.value = 'Quantita non valida.';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const body = { qty: n };
    if (cost.value !== '' && Number.isFinite(Number(cost.value)) && Number(cost.value) >= 0) {
      body.cost = Number(cost.value);
    }
    if (note.value.trim()) body.note = note.value.trim();
    await restockIngredient(token.value, props.ingredient.documentId, body);
    emit('done');
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

let savedOverflow = '';
onMounted(() => { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; });
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
</script>

<template>
  <TeleportCompat to="body">
    <div class="rs-overlay" role="dialog" aria-modal="true" @click.self="emit('cancel')">
      <div class="rs-card">
        <header class="rs-head">
          <h3><i class="bi bi-arrow-down-circle"></i> Registra carico</h3>
          <button class="rs-close" @click="emit('cancel')" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>
        <section class="rs-body">
          <p class="rs-ingredient">
            <strong>{{ ingredient.name }}</strong>
            <span class="rs-muted">Stock attuale: {{ Number(ingredient.stock_qty || 0) }} {{ ingredient.unit }}</span>
          </p>

          <label class="ds-field">
            <span class="ds-label">Quantita arrivata ({{ ingredient.unit }}) *</span>
            <input
              v-model="qty"
              type="number"
              min="0.01"
              step="0.01"
              class="ds-input"
              :disabled="submitting"
              autofocus
            >
          </label>

          <p v-if="newStockPreview !== null" class="rs-preview">
            Nuovo stock dopo carico:
            <strong>{{ newStockPreview }} {{ ingredient.unit }}</strong>
          </p>

          <label class="ds-field">
            <span class="ds-label">Costo (€, opzionale)</span>
            <input
              v-model="cost"
              type="number"
              min="0"
              step="0.01"
              class="ds-input"
              :disabled="submitting"
              placeholder="Es. 24.50"
            >
          </label>

          <label class="ds-field">
            <span class="ds-label">Nota (opzionale)</span>
            <textarea
              v-model="note"
              class="ds-input"
              :disabled="submitting"
              maxlength="500"
              rows="2"
              placeholder="Es. Fornitore Bianchi, fattura #2031"
            ></textarea>
          </label>

          <div v-if="error" class="rs-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ error }}</span>
          </div>
        </section>
        <footer class="rs-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="emit('cancel')">Annulla</button>
          <button class="ds-btn ds-btn-primary" :disabled="submitting" @click="onSubmit">
            <i v-if="submitting" class="bi bi-arrow-repeat rs-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Registra carico</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.rs-overlay {
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.rs-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 480px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.rs-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.rs-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.rs-head h3 i { color: var(--color-primary); margin-right: 6px; }
.rs-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.rs-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.rs-ingredient { margin: 0; padding: 12px; background: var(--color-bg-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; }
.rs-muted { font-size: 13px; color: var(--color-text-muted); }
.ds-field { display: flex; flex-direction: column; gap: 4px; }
.ds-label { font-size: 13px; font-weight: 500; }
.rs-preview { margin: 0; padding: 10px 12px; background: color-mix(in oklab, var(--color-success, #16a34a) 8%, var(--color-bg-subtle)); border-radius: 6px; font-size: 13px; }
.rs-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; }
.rs-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: var(--color-bg-subtle); }
.rs-spin { animation: rs-spin 0.8s linear infinite; display: inline-block; }
@keyframes rs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

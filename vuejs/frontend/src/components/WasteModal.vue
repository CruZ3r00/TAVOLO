<script setup>
// Registra scarto di un Ingredient: qty + motivo + nota.
// Crea un movement kind=waste. NON influisce sul calcolo della media uso/piatto.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import { wasteIngredient, inventoryErrorMessage } from '@/utils';

const props = defineProps({
  ingredient: { type: Object, required: true },
});
const emit = defineEmits(['cancel', 'done']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const qty = ref('');
const reason = ref('expired');
const note = ref('');
const submitting = ref(false);
const error = ref('');

const newStockPreview = computed(() => {
  const n = Number(qty.value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Number(props.ingredient.stock_qty || 0) - n).toFixed(2);
});

const reasonOptions = [
  { value: 'expired', label: 'Scaduto' },
  { value: 'broken', label: 'Rotto / Danneggiato' },
  { value: 'order_voided', label: 'Ordine cliente annullato' },
  { value: 'other', label: 'Altro' },
];

const onSubmit = async () => {
  const n = Number(qty.value);
  if (!Number.isFinite(n) || n <= 0) {
    error.value = 'Quantita non valida.';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const body = { qty: n, reason: reason.value };
    if (note.value.trim()) body.note = note.value.trim();
    await wasteIngredient(token.value, props.ingredient.documentId, body);
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
    <div class="ws-overlay" role="dialog" aria-modal="true" @click.self="emit('cancel')">
      <div class="ws-card">
        <header class="ws-head">
          <h3><i class="bi bi-trash3"></i> Registra scarto</h3>
          <button class="ws-close" @click="emit('cancel')" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>
        <section class="ws-body">
          <p class="ws-ingredient">
            <strong>{{ ingredient.name }}</strong>
            <span class="ws-muted">Stock attuale: {{ Number(ingredient.stock_qty || 0) }} {{ ingredient.unit }}</span>
          </p>

          <label class="ds-field">
            <span class="ds-label">Quantita scartata ({{ ingredient.unit }}) *</span>
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

          <p v-if="newStockPreview !== null" class="ws-preview">
            Nuovo stock dopo scarto:
            <strong>{{ newStockPreview }} {{ ingredient.unit }}</strong>
          </p>

          <label class="ds-field">
            <span class="ds-label">Motivo *</span>
            <select v-model="reason" class="ds-input ds-select" :disabled="submitting">
              <option v-for="o in reasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>

          <label class="ds-field">
            <span class="ds-label">Nota (opzionale)</span>
            <textarea
              v-model="note"
              class="ds-input"
              :disabled="submitting"
              maxlength="500"
              rows="2"
              placeholder="Es. confezione rovinata in cantina"
            ></textarea>
          </label>

          <p class="ws-info">
            <i class="bi bi-info-circle"></i>
            Lo scarto riduce lo stock ma <strong>non</strong> influisce sul calcolo della media uso per piatto.
          </p>

          <div v-if="error" class="ws-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ error }}</span>
          </div>
        </section>
        <footer class="ws-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="emit('cancel')">Annulla</button>
          <button class="ds-btn ds-btn-primary" :disabled="submitting" @click="onSubmit">
            <i v-if="submitting" class="bi bi-arrow-repeat ws-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Registra scarto</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.ws-overlay { position: fixed; inset: 0; z-index: 8500; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.ws-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 480px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.ws-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.ws-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.ws-head h3 i { color: var(--color-destructive); margin-right: 6px; }
.ws-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.ws-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.ws-ingredient { margin: 0; padding: 12px; background: var(--color-bg-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; }
.ws-muted { font-size: 13px; color: var(--color-text-muted); }
.ds-field { display: flex; flex-direction: column; gap: 4px; }
.ds-label { font-size: 13px; font-weight: 500; }
.ws-preview { margin: 0; padding: 10px 12px; background: color-mix(in oklab, var(--color-destructive) 8%, var(--color-bg-subtle)); border-radius: 6px; font-size: 13px; }
.ws-info { margin: 0; padding: 10px 12px; background: var(--color-bg-subtle); border-radius: 6px; font-size: 12px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: flex-start; }
.ws-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; }
.ws-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: var(--color-bg-subtle); }
.ws-spin { animation: ws-spin 0.8s linear infinite; display: inline-block; }
@keyframes ws-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

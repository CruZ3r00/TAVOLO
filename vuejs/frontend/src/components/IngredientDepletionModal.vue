<script setup>
// Conferma "Terminato o quasi": l'owner indica la quantita residua reale
// (0 = terminato definitivamente). Il backend ricalcola le qty_per_serving
// delle ricette in cui questo ingrediente compare, via auto-tuning EMA
// con factor clamp [0.5, 2.0].

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import { confirmDepletedIngredient, inventoryErrorMessage } from '@/utils';

const props = defineProps({
  ingredient: { type: Object, required: true },
});
const emit = defineEmits(['cancel', 'done']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const mode = ref('terminated'); // 'terminated' | 'residual'
const residual = ref('');
const submitting = ref(false);
const error = ref('');
const recalcOut = ref(null);

const onSubmit = async () => {
  submitting.value = true;
  error.value = '';
  try {
    const body = {};
    if (mode.value === 'residual') {
      const n = Number(residual.value);
      if (!Number.isFinite(n) || n < 0) {
        error.value = 'Quantita residua non valida.';
        submitting.value = false;
        return;
      }
      body.residual_qty = n;
    } else {
      body.residual_qty = 0;
    }
    const out = await confirmDepletedIngredient(token.value, props.ingredient.documentId, body);
    recalcOut.value = out?.recalc || null;
    // Lasciamo il modale aperto qualche secondo per mostrare il risultato.
    setTimeout(() => emit('done'), 1500);
  } catch (e) {
    error.value = inventoryErrorMessage(e);
    submitting.value = false;
  }
};

let savedOverflow = '';
onMounted(() => { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; });
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
</script>

<template>
  <TeleportCompat to="body">
    <div class="dp-overlay" role="dialog" aria-modal="true" @click.self="!submitting && emit('cancel')">
      <div class="dp-card">
        <header class="dp-head">
          <h3><i class="bi bi-check2-square"></i> Conferma stato ingrediente</h3>
          <button class="dp-close" :disabled="submitting" @click="emit('cancel')" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>
        <section class="dp-body">
          <p class="dp-ingredient">
            <strong>{{ ingredient.name }}</strong>
            <span class="dp-muted">Stock attuale registrato: {{ Number(ingredient.stock_qty || 0) }} {{ ingredient.unit }}</span>
          </p>

          <p class="dp-intro">
            Il sistema ha rilevato che questo ingrediente sta finendo.
            Indica lo stato reale per consentire un auto-tuning del consumo per piatto:
          </p>

          <div class="dp-modes">
            <label class="dp-mode" :class="{ active: mode === 'terminated' }">
              <input v-model="mode" type="radio" value="terminated" name="dp-mode" :disabled="submitting">
              <div>
                <strong>Terminato</strong>
                <p class="dp-mode-hint">Non ne ho piu in magazzino. Stock → 0.</p>
              </div>
            </label>
            <label class="dp-mode" :class="{ active: mode === 'residual' }">
              <input v-model="mode" type="radio" value="residual" name="dp-mode" :disabled="submitting">
              <div>
                <strong>Quantita residua</strong>
                <p class="dp-mode-hint">Indico quanto e' ancora disponibile in magazzino.</p>
              </div>
            </label>
          </div>

          <label v-if="mode === 'residual'" class="ds-field">
            <span class="ds-label">Quantita residua ({{ ingredient.unit }})</span>
            <input
              v-model="residual"
              type="number"
              min="0"
              step="0.01"
              class="ds-input"
              :disabled="submitting"
              placeholder="Es. 1.5"
            >
          </label>

          <div v-if="recalcOut" class="dp-recalc">
            <i class="bi bi-magic"></i>
            <div>
              <strong>Ricetta aggiornata</strong>
              <p>
                Auto-tuning applicato: factor {{ recalcOut.factor.toFixed(3) }}
                ({{ recalcOut.updated }} ricette aggiornate).
                Consumo atteso ricalibrato {{ recalcOut.qty_actual.toFixed(2) }}/{{ recalcOut.qty_expected.toFixed(2) }} {{ ingredient.unit }}.
              </p>
            </div>
          </div>

          <div v-if="error" class="dp-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ error }}</span>
          </div>
        </section>
        <footer class="dp-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="emit('cancel')">Annulla</button>
          <button class="ds-btn ds-btn-primary" :disabled="submitting" @click="onSubmit">
            <i v-if="submitting" class="bi bi-arrow-repeat dp-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Conferma e ricalcola</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.dp-overlay { position: fixed; inset: 0; z-index: 8500; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dp-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 520px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.dp-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.dp-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.dp-head h3 i { color: var(--color-primary); margin-right: 6px; }
.dp-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.dp-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.dp-ingredient { margin: 0; padding: 12px; background: var(--color-bg-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; }
.dp-muted { font-size: 13px; color: var(--color-text-muted); }
.dp-intro { margin: 0; font-size: 14px; color: var(--color-text-secondary); }
.dp-modes { display: flex; flex-direction: column; gap: 8px; }
.dp-mode { display: flex; gap: 12px; padding: 12px; border: 1.5px solid var(--color-border); border-radius: 8px; cursor: pointer; align-items: flex-start; }
.dp-mode.active { border-color: var(--color-primary); background: color-mix(in oklab, var(--color-primary) 6%, var(--color-bg)); }
.dp-mode input { margin-top: 3px; }
.dp-mode strong { display: block; font-size: 14px; font-weight: 600; }
.dp-mode-hint { margin: 2px 0 0; font-size: 12px; color: var(--color-text-muted); }
.ds-field { display: flex; flex-direction: column; gap: 4px; }
.ds-label { font-size: 13px; font-weight: 500; }
.dp-recalc { display: flex; gap: 12px; padding: 12px; background: color-mix(in oklab, var(--color-success, #16a34a) 10%, var(--color-bg-subtle)); border-radius: 8px; font-size: 13px; align-items: flex-start; }
.dp-recalc i { color: var(--color-success, #16a34a); font-size: 20px; }
.dp-recalc p { margin: 4px 0 0; color: var(--color-text-secondary); }
.dp-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; }
.dp-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: var(--color-bg-subtle); }
.dp-spin { animation: dp-spin 0.8s linear infinite; display: inline-block; }
@keyframes dp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

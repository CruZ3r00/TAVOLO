<script setup>
// Modale di configurazione "Aggiunta" di un ingrediente.
// Riusato da PantryView (Pro) e IngredientsManager (Starter).
//
// Props:
//   - ingredient: oggetto con almeno { documentId, name, unit?, is_addon,
//     addon_price, addon_avg_qty }
//   - isPro: boolean — se true mostra anche il campo quantita media (gating
//     piano Pro). Su Starter il campo qty media e' nascosto (lato server e'
//     forzato a null).
//   - mode: 'enable' (toggle appena attivato, devo impostare prezzo prima di
//     confermare) | 'edit' (configurazione esistente, modifica liberamente)
//     — cambia solo testi/CTA.
//
// Emits:
//   - cancel: l'utente annulla. Il chiamante deve riportare il toggle al suo
//     stato precedente se la modale era stata aperta in modalita' 'enable'.
//   - saved(payload): salvataggio andato a buon fine. Payload =
//     { is_addon: true, addon_price, addon_avg_qty }.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import { setIngredientAddonConfig, inventoryErrorMessage } from '@/utils';

const props = defineProps({
  ingredient: { type: Object, required: true },
  isPro: { type: Boolean, default: false },
  mode: { type: String, default: 'edit' },
});
const emit = defineEmits(['cancel', 'saved']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const price = ref(
  props.ingredient.addon_price !== null && props.ingredient.addon_price !== undefined
    ? String(props.ingredient.addon_price)
    : ''
);
const avgQty = ref(
  props.ingredient.addon_avg_qty !== null && props.ingredient.addon_avg_qty !== undefined
    ? String(props.ingredient.addon_avg_qty)
    : ''
);
const submitting = ref(false);
const error = ref('');

const title = computed(() => (props.mode === 'enable' ? 'Configura aggiunta' : 'Modifica aggiunta'));
const submitLabel = computed(() => (props.mode === 'enable' ? 'Attiva aggiunta' : 'Salva'));

const onSubmit = async () => {
  const p = Number(price.value);
  if (!Number.isFinite(p) || p < 0) {
    error.value = 'Inserisci un prezzo valido (>= 0).';
    return;
  }
  let q = null;
  if (props.isPro && avgQty.value !== '') {
    q = Number(avgQty.value);
    if (!Number.isFinite(q) || q < 0) {
      error.value = 'Quantita media non valida.';
      return;
    }
  }

  submitting.value = true;
  error.value = '';
  try {
    const body = { is_addon: true, addon_price: p };
    if (props.isPro) body.addon_avg_qty = q;
    await setIngredientAddonConfig(props.ingredient.documentId, body, token.value);
    emit('saved', { is_addon: true, addon_price: p, addon_avg_qty: props.isPro ? q : null });
  } catch (e) {
    error.value = inventoryErrorMessage ? inventoryErrorMessage(e) : (e?.message || 'Errore salvataggio.');
  } finally {
    submitting.value = false;
  }
};

let savedOverflow = '';
const onKeydown = (e) => { if (e.key === 'Escape') emit('cancel'); };
onMounted(() => {
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.body.style.overflow = savedOverflow;
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <TeleportCompat to="body">
    <div class="ac-overlay" role="dialog" aria-modal="true" @click.self="emit('cancel')">
      <div class="ac-card">
        <header class="ac-head">
          <h3><i class="bi bi-plus-circle"></i> {{ title }}</h3>
          <button class="ac-close" aria-label="Chiudi" @click="emit('cancel')">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>
        <section class="ac-body">
          <p class="ac-ingredient">
            <strong>{{ ingredient.name }}</strong>
            <span v-if="ingredient.unit" class="ac-muted">Unita: {{ ingredient.unit }}</span>
          </p>

          <p class="ac-hint">
            Configura come questo ingrediente puo' essere aggiunto ai piatti durante la presa ordine.
            Il cameriere potra' selezionarlo come "aggiunta" pagante (es. <em>+ Mozzarella</em>).
          </p>

          <label class="ds-field">
            <span class="ds-label">Prezzo aggiunta (€) *</span>
            <input
              v-model="price"
              type="number"
              min="0"
              step="0.01"
              class="ds-input"
              :disabled="submitting"
              autofocus
              placeholder="Es. 1.50"
            >
            <span class="ac-help">Sara' sommato al prezzo del piatto per ogni unita'.</span>
          </label>

          <label v-if="isPro" class="ds-field">
            <span class="ds-label">
              Quantita media per aggiunta ({{ ingredient.unit || 'pz' }})
            </span>
            <input
              v-model="avgQty"
              type="number"
              min="0"
              step="0.01"
              class="ds-input"
              :disabled="submitting"
              placeholder="Es. 0.05"
            >
            <span class="ac-help">
              Usata per scaricare il magazzino quando il piatto viene servito.
              Lascia vuoto se non vuoi scaricare lo stock automaticamente.
            </span>
          </label>

          <div v-if="error" class="ac-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ error }}</span>
          </div>
        </section>
        <footer class="ac-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="emit('cancel')">Annulla</button>
          <button class="ds-btn ds-btn-primary" :disabled="submitting" @click="onSubmit">
            <i v-if="submitting" class="bi bi-arrow-repeat ac-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>{{ submitLabel }}</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.ac-overlay {
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.ac-card { background: var(--color-bg, #fff); color: var(--color-text); border-radius: 12px; width: 100%; max-width: 480px; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); border: 1px solid var(--color-border); }
.ac-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.ac-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.ac-head h3 i { color: var(--color-primary); margin-right: 6px; }
.ac-close { appearance: none; background: transparent; border: none; cursor: pointer; padding: 4px; color: var(--color-text-muted); }
.ac-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.ac-ingredient { margin: 0; padding: 12px; background: var(--color-bg-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; }
.ac-muted { font-size: 13px; color: var(--color-text-muted); }
.ac-hint { margin: 0; font-size: 13px; color: var(--color-text-secondary, var(--color-text-muted)); line-height: 1.45; }
.ds-field { display: flex; flex-direction: column; gap: 4px; }
.ds-label { font-size: 13px; font-weight: 500; }
.ac-help { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
.ac-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); color: var(--color-destructive); border-radius: 6px; font-size: 13px; }
.ac-foot { padding: 12px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: var(--color-bg-subtle); }
.ac-spin { animation: ac-spin 0.8s linear infinite; display: inline-block; }
@keyframes ac-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

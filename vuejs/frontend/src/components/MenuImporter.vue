<script setup>
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import { useStore } from 'vuex';
import { importMenuAnalyze, importMenuBulk } from '@/utils';

const props = defineProps({
  currentCount: { type: Number, default: 0 },
});

const emit = defineEmits(['loading-start', 'loading-end', 'imported', 'error']);

const store = useStore();
const tkn = store.getters.getToken;

const fileInput = ref(null);
const isAnalyzing = ref(false);
const isSubmitting = ref(false);
const showReviewModal = ref(false);
const showModeModal = ref(false);
const showReplaceConfirmModal = ref(false);
const pendingMode = ref(null);

const extractedElements = ref([]);
const warnings = ref([]);
const reviewErrorMsg = ref('');
const invalidIndexes = ref([]);
const modifiedFromSource = ref(false);

const PRESET_CATEGORIES = [
  'Bevande', 'Dessert', 'Pizze classiche', 'Pizze bianche', 'Pizze rosse',
  'Primi', 'Secondi', 'Primi di pesce', 'Secondi di pesce', 'Contorni', 'Antipasti',
];
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

// La beforeunload guard è attiva in qualsiasi fase durante cui perdere il lavoro
// avrebbe impatto utente: analisi in corso, review con modifiche, submit in corso.
const shouldGuardUnload = computed(() =>
  isAnalyzing.value || isSubmitting.value ||
  showReviewModal.value || showModeModal.value || showReplaceConfirmModal.value,
);

const onBeforeUnload = (e) => {
  e.preventDefault();
  e.returnValue = '';
  return '';
};

watch(shouldGuardUnload, (active) => {
  if (active) {
    window.addEventListener('beforeunload', onBeforeUnload);
  } else {
    window.removeEventListener('beforeunload', onBeforeUnload);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
});

const mapErrorMessage = (err) => {
  const status = err?.status;
  const code = err?.code;
  if (status === 503 && code === 'LLM_UNAVAILABLE') return 'Servizio AI non disponibile, riprova piu tardi.';
  if (status === 503 && code === 'OCR_UNAVAILABLE') return 'Servizio di analisi non raggiungibile.';
  if (status === 503) return 'Servizio di analisi temporaneamente non disponibile.';
  if (status === 504 || code === 'OCR_TIMEOUT') return 'Elaborazione troppo lunga, riprova con un file piu piccolo.';
  if (status === 401) return 'Sessione scaduta, rieffettua il login.';
  if (status === 422) return err.message || 'Nessun elemento riconosciuto nel documento.';
  if (status === 400) return err.message || 'File non valido.';
  return err?.message || 'Errore imprevisto durante l\'analisi.';
};

const trigger = () => {
  if (isAnalyzing.value || isSubmitting.value) return;
  reviewErrorMsg.value = '';
  fileInput.value && fileInput.value.click();
};

const resetState = () => {
  extractedElements.value = [];
  warnings.value = [];
  invalidIndexes.value = [];
  reviewErrorMsg.value = '';
  modifiedFromSource.value = false;
  pendingMode.value = null;
  showReviewModal.value = false;
  showModeModal.value = false;
  showReplaceConfirmModal.value = false;
};

const onFileSelected = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    emit('error', `Formato non supportato: .${ext}. Usa PDF, PNG, JPG, JPEG o WEBP.`);
    return;
  }
  if (file.size > MAX_SIZE_BYTES) {
    emit('error', 'File troppo grande: il limite e 20 MB.');
    return;
  }

  await analyzeFile(file);
};

const analyzeFile = async (file) => {
  isAnalyzing.value = true;
  emit('loading-start');
  try {
    const data = await importMenuAnalyze(file, tkn);
    const list = Array.isArray(data?.elements) ? data.elements : [];
    if (list.length === 0) {
      emit('error', 'Nessun elemento riconosciuto nel documento.');
      return;
    }
    extractedElements.value = list.map((el) => ({
      name: el.name || '',
      price: el.price ?? null,
      category: el.category || '',
      useCustomCategory: !!(el.category && !PRESET_CATEGORIES.includes(el.category)),
      ingredients: Array.isArray(el.ingredients) ? [...el.ingredients] : [],
      allergens: Array.isArray(el.allergens) ? [...el.allergens] : [],
      _missing: el._missing || {},
    }));
    warnings.value = Array.isArray(data?.warnings) ? data.warnings : [];
    modifiedFromSource.value = false;
    showReviewModal.value = true;
  } catch (err) {
    console.error('[MenuImporter] analyze failed:', err);
    emit('error', mapErrorMessage(err));
    resetState();
  } finally {
    isAnalyzing.value = false;
    emit('loading-end');
  }
};

const markModified = () => { modifiedFromSource.value = true; };

const removeElement = (idx) => {
  extractedElements.value.splice(idx, 1);
  markModified();
};

const addIngredient = (idx) => { extractedElements.value[idx].ingredients.push(''); markModified(); };
const removeIngredient = (idx, i) => { extractedElements.value[idx].ingredients.splice(i, 1); markModified(); };
const addAllergen = (idx) => { extractedElements.value[idx].allergens.push(''); markModified(); };
const removeAllergen = (idx, i) => { extractedElements.value[idx].allergens.splice(i, 1); markModified(); };
const toggleCustomCategory = (idx, value) => {
  extractedElements.value[idx].useCustomCategory = value;
  markModified();
};

const isElementValid = (el) => {
  return !!(el.name && el.name.trim())
    && el.price != null && !isNaN(parseFloat(el.price)) && parseFloat(el.price) > 0
    && !!(el.category && el.category.trim());
};

const validateAll = () => {
  const invalid = [];
  extractedElements.value.forEach((el, idx) => {
    if (!isElementValid(el)) invalid.push(idx);
  });
  invalidIndexes.value = invalid;
  return invalid.length === 0;
};

const requestClose = () => {
  if (isSubmitting.value) return;
  if (modifiedFromSource.value) {
    const ok = window.confirm('Chiudere la finestra? Le modifiche effettuate andranno perse.');
    if (!ok) return;
  }
  resetState();
};

const openModeModal = () => {
  reviewErrorMsg.value = '';
  if (extractedElements.value.length === 0) {
    reviewErrorMsg.value = 'Nessun elemento da importare.';
    return;
  }
  if (!validateAll()) {
    reviewErrorMsg.value = 'Completa nome, prezzo (> 0) e categoria per tutti gli elementi evidenziati.';
    return;
  }
  showModeModal.value = true;
};

const chooseMode = (mode) => {
  pendingMode.value = mode;
  if (mode === 'replace') {
    showModeModal.value = false;
    showReplaceConfirmModal.value = true;
  } else {
    showModeModal.value = false;
    submitBulk();
  }
};

const cancelReplaceConfirm = () => {
  showReplaceConfirmModal.value = false;
  pendingMode.value = null;
  showModeModal.value = true;
};

const confirmReplace = () => {
  showReplaceConfirmModal.value = false;
  submitBulk();
};

const submitBulk = async () => {
  if (!pendingMode.value) return;
  isSubmitting.value = true;
  try {
    const payload = {
      mode: pendingMode.value,
      elements: extractedElements.value.map((el) => ({
        name: el.name.trim(),
        price: parseFloat(el.price),
        category: (el.category || '').trim(),
        ingredients: el.ingredients.map((s) => (s || '').trim()).filter(Boolean),
        allergens: el.allergens.map((s) => (s || '').trim()).filter(Boolean),
      })),
    };
    const data = await importMenuBulk(payload, tkn);
    const createdCount = data?.created_count ?? payload.elements.length;
    const failedCount = data?.failed_count ?? 0;
    const deletedCount = data?.deleted_count ?? 0;
    emit('imported', {
      mode: pendingMode.value,
      createdCount,
      failedCount,
      deletedCount,
    });
    resetState();
  } catch (err) {
    console.error('[MenuImporter] bulk failed:', err);
    if (err?.status === 401) {
      emit('error', 'Sessione scaduta, rieffettua il login.');
    } else {
      emit('error', err?.message || 'Errore durante l\'import.');
    }
  } finally {
    isSubmitting.value = false;
  }
};

defineExpose({ trigger });
</script>

<template>
  <div class="menu-importer-root">
    <input
      ref="fileInput"
      type="file"
      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
      class="hidden-file"
      @change="onFileSelected"
    />

    <!-- Modale review elementi estratti -->
    <Teleport to="body">
      <div v-if="showReviewModal" class="importer-backdrop" @click.self="requestClose">
        <div class="importer-modal" role="dialog" aria-modal="true" aria-labelledby="importerReviewTitle">
          <div class="importer-header">
            <div>
              <h3 id="importerReviewTitle" class="importer-title">
                Verifica menu rilevato
                <span class="ds-badge ds-badge-primary count-badge">{{ extractedElements.length }}</span>
              </h3>
              <p class="importer-subtitle">
                Rivedi i dati estratti. Correggi o completa i campi mancanti prima di confermare.
              </p>
            </div>
            <button
              type="button"
              class="ds-btn ds-btn-ghost ds-btn-icon"
              aria-label="Chiudi"
              :disabled="isSubmitting"
              @click="requestClose"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div class="importer-alerts">
            <div class="alert-banner alert-banner-warning">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>Verifica i dati prima di confermare. Chiudere la pagina comporterà la perdita dei dati.</span>
            </div>
            <div
              v-for="(w, wi) in warnings"
              :key="`w-${wi}`"
              class="alert-banner alert-banner-info"
            >
              <i class="bi bi-info-circle"></i>
              <span>{{ w }}</span>
            </div>
            <div v-if="reviewErrorMsg" class="alert-banner alert-banner-error">
              <i class="bi bi-exclamation-circle"></i>
              <span>{{ reviewErrorMsg }}</span>
            </div>
          </div>

          <div class="importer-body">
            <div
              v-for="(el, idx) in extractedElements"
              :key="idx"
              class="element-card"
              :class="{ 'element-card-invalid': invalidIndexes.includes(idx) }"
            >
              <div class="element-card-header">
                <span class="element-index">#{{ idx + 1 }}</span>
                <button
                  type="button"
                  class="ds-btn ds-btn-ghost ds-btn-sm"
                  :disabled="isSubmitting"
                  @click="removeElement(idx)"
                >
                  <i class="bi bi-trash"></i> Rimuovi
                </button>
              </div>

              <div class="form-row-2">
                <div class="ds-field" style="flex:2;">
                  <label class="ds-label">
                    Nome
                    <span v-if="el._missing?.name" class="field-warn">da completare</span>
                  </label>
                  <input
                    v-model="el.name"
                    type="text"
                    class="ds-input"
                    placeholder="Nome piatto"
                    @input="markModified"
                  />
                </div>
                <div class="ds-field" style="flex:1;">
                  <label class="ds-label">
                    Prezzo
                    <span v-if="el._missing?.price" class="field-warn">da completare</span>
                  </label>
                  <div class="price-input-wrap">
                    <input
                      v-model.number="el.price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      class="ds-input"
                      placeholder="0.00"
                      @input="markModified"
                    />
                    <span class="price-suffix">&euro;</span>
                  </div>
                </div>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Categoria
                  <span v-if="el._missing?.category" class="field-warn">da completare</span>
                </label>
                <div v-if="!el.useCustomCategory" class="form-row-2">
                  <select
                    v-model="el.category"
                    class="ds-input ds-select"
                    style="flex:1;"
                    @change="markModified"
                  >
                    <option value="" disabled>Seleziona una categoria</option>
                    <option v-for="c in PRESET_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <button
                    type="button"
                    class="toggle-category"
                    @click="toggleCustomCategory(idx, true)"
                  >
                    Personalizzata
                  </button>
                </div>
                <div v-else class="form-row-2">
                  <input
                    v-model="el.category"
                    type="text"
                    class="ds-input"
                    style="flex:1;"
                    placeholder="Categoria personalizzata"
                    @input="markModified"
                  />
                  <button
                    type="button"
                    class="toggle-category"
                    @click="toggleCustomCategory(idx, false)"
                  >
                    Lista predefinita
                  </button>
                </div>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Ingredienti
                  <span v-if="el._missing?.ingredients" class="field-warn">non rilevati</span>
                </label>
                <div
                  v-for="(ing, i) in el.ingredients"
                  :key="`ing-${idx}-${i}`"
                  class="list-input-row"
                >
                  <input
                    v-model="el.ingredients[i]"
                    class="ds-input"
                    placeholder="Ingrediente..."
                    @input="markModified"
                  />
                  <button
                    type="button"
                    class="ds-btn ds-btn-ghost ds-btn-icon"
                    @click="removeIngredient(idx, i)"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
                <button
                  type="button"
                  class="ds-btn ds-btn-ghost ds-btn-sm"
                  @click="addIngredient(idx)"
                >
                  <i class="bi bi-plus"></i> Aggiungi ingrediente
                </button>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Allergeni
                  <span v-if="el._missing?.allergens" class="field-warn">non rilevati</span>
                </label>
                <div
                  v-for="(al, i) in el.allergens"
                  :key="`al-${idx}-${i}`"
                  class="list-input-row"
                >
                  <input
                    v-model="el.allergens[i]"
                    class="ds-input"
                    placeholder="Allergene..."
                    @input="markModified"
                  />
                  <button
                    type="button"
                    class="ds-btn ds-btn-ghost ds-btn-icon"
                    @click="removeAllergen(idx, i)"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
                <button
                  type="button"
                  class="ds-btn ds-btn-ghost ds-btn-sm"
                  @click="addAllergen(idx)"
                >
                  <i class="bi bi-plus"></i> Aggiungi allergene
                </button>
              </div>
            </div>

            <div v-if="extractedElements.length === 0" class="empty-state">
              Nessun elemento da importare.
            </div>
          </div>

          <div class="importer-footer">
            <button
              type="button"
              class="ds-btn ds-btn-ghost"
              :disabled="isSubmitting"
              @click="requestClose"
            >
              Annulla
            </button>
            <button
              type="button"
              class="ds-btn ds-btn-primary"
              :disabled="isSubmitting || extractedElements.length === 0"
              @click="openModeModal"
            >
              <i class="bi bi-check2"></i>
              <span>Conferma e importa</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modale scelta modalità -->
    <Teleport to="body">
      <div v-if="showModeModal" class="importer-backdrop mode-backdrop" @click.self="showModeModal = false">
        <div class="mode-modal" role="dialog" aria-modal="true" aria-labelledby="modeModalTitle">
          <div class="mode-header">
            <h3 id="modeModalTitle" class="mode-title">Come vuoi procedere?</h3>
            <button
              type="button"
              class="ds-btn ds-btn-ghost ds-btn-icon"
              aria-label="Chiudi"
              @click="showModeModal = false"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="mode-body">
            <button type="button" class="mode-option mode-option-danger" @click="chooseMode('replace')">
              <div class="mode-option-head">
                <i class="bi bi-arrow-repeat"></i>
                <span class="mode-option-title">Sostituisci menu attuale</span>
              </div>
              <p class="mode-option-desc">Elimina i piatti esistenti e inserisce i nuovi.</p>
              <p v-if="props.currentCount > 0" class="mode-option-note">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Verranno rimossi {{ props.currentCount }} piatti esistenti.
              </p>
            </button>

            <button type="button" class="mode-option mode-option-primary" @click="chooseMode('append')">
              <div class="mode-option-head">
                <i class="bi bi-plus-circle"></i>
                <span class="mode-option-title">Aggiungi al menu attuale</span>
              </div>
              <p class="mode-option-desc">Mantiene i piatti esistenti e aggiunge i nuovi.</p>
            </button>
          </div>
          <div class="mode-footer">
            <button type="button" class="ds-btn ds-btn-ghost" @click="showModeModal = false">
              Annulla
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modale conferma distruttiva per replace -->
    <Teleport to="body">
      <div
        v-if="showReplaceConfirmModal"
        class="importer-backdrop mode-backdrop"
        @click.self="cancelReplaceConfirm"
      >
        <div class="mode-modal mode-modal-small" role="alertdialog" aria-modal="true" aria-labelledby="replaceConfirmTitle">
          <div class="mode-header">
            <h3 id="replaceConfirmTitle" class="mode-title">
              <i class="bi bi-exclamation-triangle-fill text-danger"></i>
              Sei sicuro?
            </h3>
          </div>
          <div class="mode-body">
            <p class="mode-confirm-text">
              Questa azione eliminerà
              <strong>{{ props.currentCount }}</strong>
              piatti esistenti e li sostituirà con quelli importati.
              <br />
              <strong>L'operazione è irreversibile.</strong>
            </p>
          </div>
          <div class="mode-footer">
            <button
              type="button"
              class="ds-btn ds-btn-ghost"
              :disabled="isSubmitting"
              @click="cancelReplaceConfirm"
            >
              Annulla
            </button>
            <button
              type="button"
              class="ds-btn ds-btn-danger"
              :disabled="isSubmitting"
              @click="confirmReplace"
            >
              <span v-if="isSubmitting" class="ds-spinner"></span>
              <template v-else>
                <i class="bi bi-check2"></i>
                <span>Sì, sostituisci</span>
              </template>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Spinner submit globale quando attivo -->
    <Teleport to="body">
      <div v-if="isSubmitting && !showReplaceConfirmModal" class="importer-backdrop submit-backdrop">
        <div class="submit-panel">
          <div class="spinner-border text-primary" role="status" aria-hidden="true"></div>
          <p class="submit-text">Importazione in corso...</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.menu-importer-root {
  display: contents;
}

.hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
}

.importer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.mode-backdrop {
  z-index: 1700;
}
.submit-backdrop {
  z-index: 2100;
  background: rgba(15, 23, 42, 0.6);
}

.importer-modal {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  width: 100%;
  max-width: 860px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}

.importer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  gap: 12px;
}
.importer-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.count-badge {
  font-size: 0.8rem;
}
.importer-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}

.importer-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px 0;
}

.alert-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.4;
}
.alert-banner i {
  font-size: 1rem;
  margin-top: 2px;
}
.alert-banner-warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}
.alert-banner-info {
  background: #e0f2fe;
  color: #075985;
  border: 1px solid #7dd3fc;
}
.alert-banner-error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.importer-body {
  overflow-y: auto;
  padding: 16px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.importer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.element-card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-bg-subtle, #fafafa);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.15s, background 0.15s;
}
.element-card-invalid {
  border-color: #fca5a5;
  background: #fef2f2;
}
.element-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.element-index {
  font-weight: 700;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.875rem;
}

.field-warn {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.7rem;
  font-weight: 500;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 2px 8px;
  vertical-align: middle;
}

.form-row-2 {
  display: flex;
  gap: 12px;
}
.list-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.list-input-row .ds-input {
  flex: 1;
}

.price-input-wrap {
  position: relative;
}
.price-input-wrap .ds-input {
  padding-right: 32px;
}
.price-suffix {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted, #6b7280);
  font-size: 0.875rem;
}

.toggle-category {
  background: none;
  border: none;
  color: var(--color-primary, #2563eb);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0 8px;
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted, #6b7280);
  padding: 40px;
}

/* Mode modal */
.mode-modal {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.mode-modal-small {
  max-width: 460px;
}
.mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.mode-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mode-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mode-confirm-text {
  font-size: 0.95rem;
  color: var(--color-text, #111827);
  margin: 0;
  line-height: 1.5;
}
.mode-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.mode-option {
  text-align: left;
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mode-option:hover {
  transform: translateY(-1px);
}
.mode-option-primary:hover {
  border-color: var(--color-primary, #2563eb);
  background: #eff6ff;
}
.mode-option-danger:hover {
  border-color: #dc2626;
  background: #fef2f2;
}
.mode-option-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}
.mode-option-head i {
  font-size: 1.25rem;
}
.mode-option-danger .mode-option-head i {
  color: #dc2626;
}
.mode-option-primary .mode-option-head i {
  color: var(--color-primary, #2563eb);
}
.mode-option-title {
  font-weight: 600;
}
.mode-option-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}
.mode-option-note {
  font-size: 0.8rem;
  color: #b45309;
  background: #fef3c7;
  border-radius: 6px;
  padding: 6px 10px;
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.submit-panel {
  background: #fff;
  padding: 28px 40px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}
.submit-text {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text, #111827);
  font-weight: 500;
}

.text-danger {
  color: #dc2626 !important;
}

@media (max-width: 640px) {
  .form-row-2 {
    flex-direction: column;
  }
  .importer-modal {
    max-height: 100vh;
    border-radius: 0;
  }
}
</style>

<script setup>
import { ref } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;

const emit = defineEmits(['imported']);

const fileInput = ref(null);
const isAnalyzing = ref(false);
const isSubmitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const showModal = ref(false);
const extractedElements = ref([]);

const PRESET_CATEGORIES = [
  'Bevande', 'Dessert', 'Pizze classiche', 'Pizze bianche', 'Pizze rosse',
  'Primi', 'Secondi', 'Primi di pesce', 'Secondi di pesce', 'Contorni', 'Antipasti',
];

const openPicker = () => {
  errorMsg.value = '';
  successMsg.value = '';
  fileInput.value && fileInput.value.click();
};

const onFileSelected = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  await analyzeFile(file);
  e.target.value = '';
};

const analyzeFile = async (file) => {
  errorMsg.value = '';
  isAnalyzing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`${API_BASE}/api/menus/import/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tkn}` },
      body: fd,
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error((data && (data.error?.message || data.message)) || 'Analisi fallita.');
    }
    const list = (data.data && data.data.elements) || [];
    if (list.length === 0) {
      errorMsg.value = 'Nessun elemento riconosciuto nel documento.';
      return;
    }
    extractedElements.value = list.map((el) => ({
      name: el.name || '',
      price: el.price ?? null,
      category: el.category || '',
      useCustomCategory: el.category && !PRESET_CATEGORIES.includes(el.category),
      ingredients: Array.isArray(el.ingredients) ? [...el.ingredients] : [],
      allergens: Array.isArray(el.allergens) ? [...el.allergens] : [],
      _missing: el._missing || {},
    }));
    showModal.value = true;
  } catch (err) {
    console.error(err);
    errorMsg.value = err.message || 'Errore durante l\'analisi.';
  } finally {
    isAnalyzing.value = false;
  }
};

const removeElement = (idx) => {
  extractedElements.value.splice(idx, 1);
};

const addIngredient = (idx) => extractedElements.value[idx].ingredients.push('');
const removeIngredient = (idx, i) => extractedElements.value[idx].ingredients.splice(i, 1);
const addAllergen = (idx) => extractedElements.value[idx].allergens.push('');
const removeAllergen = (idx, i) => extractedElements.value[idx].allergens.splice(i, 1);

const isElementValid = (el) => {
  return !!el.name && el.price != null && parseFloat(el.price) > 0 && !!el.category;
};

const confirmImport = async () => {
  errorMsg.value = '';
  successMsg.value = '';

  // Validazione preliminare lato client
  const invalid = extractedElements.value.findIndex((el) => !isElementValid(el));
  if (invalid !== -1) {
    errorMsg.value = `Elemento #${invalid + 1}: completa nome, prezzo (> 0) e categoria prima di confermare.`;
    return;
  }

  isSubmitting.value = true;
  try {
    const payload = {
      elements: extractedElements.value.map((el) => ({
        name: el.name.trim(),
        price: parseFloat(el.price),
        category: el.category.trim(),
        ingredients: el.ingredients.map((s) => s.trim()).filter(Boolean),
        allergens: el.allergens.map((s) => s.trim()).filter(Boolean),
      })),
    };

    const resp = await fetch(`${API_BASE}/api/menus/import/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tkn}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error((data && (data.error?.message || data.message)) || 'Import fallito.');
    }
    const createdCount = data.data?.created_count ?? 0;
    const failedCount = data.data?.failed_count ?? 0;
    successMsg.value = `Import completato: ${createdCount} elementi aggiunti${failedCount ? `, ${failedCount} falliti` : ''}.`;
    showModal.value = false;
    extractedElements.value = [];
    emit('imported', { createdCount, failedCount });
  } catch (err) {
    console.error(err);
    errorMsg.value = err.message || 'Errore durante l\'import.';
  } finally {
    isSubmitting.value = false;
  }
};

const closeModal = () => {
  if (isSubmitting.value) return;
  showModal.value = false;
  extractedElements.value = [];
};
</script>

<template>
  <div class="menu-importer">
    <button type="button" class="ds-btn ds-btn-secondary" :disabled="isAnalyzing" @click="openPicker">
      <span v-if="isAnalyzing" class="ds-spinner"></span>
      <template v-else>
        <i class="bi bi-file-earmark-arrow-up"></i>
        <span>Importa da PDF/Immagine</span>
      </template>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/pdf,image/*"
      class="hidden-file"
      @change="onFileSelected"
    />

    <Transition name="fade">
      <div v-if="errorMsg" class="ds-alert ds-alert-error" style="margin-top:12px;">
        <i class="bi bi-exclamation-circle"></i><span>{{ errorMsg }}</span>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="successMsg" class="ds-alert ds-alert-success" style="margin-top:12px;">
        <i class="bi bi-check-circle"></i><span>{{ successMsg }}</span>
      </div>
    </Transition>

    <!-- Modale review -->
    <Teleport to="body">
      <div v-if="showModal" class="importer-backdrop" @click.self="closeModal">
        <div class="importer-modal">
          <div class="importer-header">
            <div>
              <h3 class="importer-title">Rivedi elementi estratti</h3>
              <p class="importer-subtitle">
                {{ extractedElements.length }} elementi riconosciuti. Completa o correggi i campi mancanti prima di importare.
              </p>
            </div>
            <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="closeModal" :disabled="isSubmitting">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div v-if="errorMsg" class="ds-alert ds-alert-error" style="margin: 0 20px 12px;">
            <i class="bi bi-exclamation-circle"></i><span>{{ errorMsg }}</span>
          </div>

          <div class="importer-body">
            <div v-for="(el, idx) in extractedElements" :key="idx" class="element-card">
              <div class="element-card-header">
                <span class="element-index">#{{ idx + 1 }}</span>
                <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="removeElement(idx)">
                  <i class="bi bi-trash"></i> Rimuovi
                </button>
              </div>

              <div class="form-row-2">
                <div class="ds-field" style="flex:2;">
                  <label class="ds-label">
                    Nome
                    <span v-if="el._missing.name" class="field-warn">da completare</span>
                  </label>
                  <input v-model="el.name" type="text" class="ds-input" placeholder="Nome piatto" />
                </div>
                <div class="ds-field" style="flex:1;">
                  <label class="ds-label">
                    Prezzo
                    <span v-if="el._missing.price" class="field-warn">da completare</span>
                  </label>
                  <input v-model.number="el.price" type="number" step="0.01" min="0.01" class="ds-input" placeholder="0.00" />
                </div>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Categoria
                  <span v-if="el._missing.category" class="field-warn">da completare</span>
                </label>
                <div v-if="!el.useCustomCategory" class="form-row-2">
                  <select v-model="el.category" class="ds-input ds-select" style="flex:1;">
                    <option value="" disabled>Seleziona una categoria</option>
                    <option v-for="c in PRESET_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <button type="button" class="toggle-category" @click="el.useCustomCategory = true">
                    Personalizzata
                  </button>
                </div>
                <div v-else class="form-row-2">
                  <input v-model="el.category" type="text" class="ds-input" style="flex:1;" placeholder="Categoria personalizzata" />
                  <button type="button" class="toggle-category" @click="el.useCustomCategory = false">
                    Lista predefinita
                  </button>
                </div>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Ingredienti
                  <span v-if="el._missing.ingredients" class="field-warn">non rilevati</span>
                </label>
                <div v-for="(ing, i) in el.ingredients" :key="i" class="list-input-row">
                  <input v-model="el.ingredients[i]" class="ds-input" placeholder="Ingrediente..." />
                  <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeIngredient(idx, i)">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
                <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addIngredient(idx)">
                  <i class="bi bi-plus"></i> Aggiungi ingrediente
                </button>
              </div>

              <div class="ds-field">
                <label class="ds-label">
                  Allergeni
                  <span v-if="el._missing.allergens" class="field-warn">non rilevati</span>
                </label>
                <div v-for="(al, i) in el.allergens" :key="i" class="list-input-row">
                  <input v-model="el.allergens[i]" class="ds-input" placeholder="Allergene..." />
                  <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeAllergen(idx, i)">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
                <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addAllergen(idx)">
                  <i class="bi bi-plus"></i> Aggiungi allergene
                </button>
              </div>
            </div>

            <div v-if="extractedElements.length === 0" class="empty-state">
              Nessun elemento da importare.
            </div>
          </div>

          <div class="importer-footer">
            <button type="button" class="ds-btn ds-btn-ghost" @click="closeModal" :disabled="isSubmitting">
              Annulla
            </button>
            <button
              type="button"
              class="ds-btn ds-btn-primary"
              :disabled="isSubmitting || extractedElements.length === 0"
              @click="confirmImport"
            >
              <span v-if="isSubmitting" class="ds-spinner"></span>
              <template v-else>
                <i class="bi bi-check2"></i>
                <span>Conferma e importa ({{ extractedElements.length }})</span>
              </template>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hidden-file { display: none; }

.importer-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.importer-modal {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  width: 100%; max-width: 820px; max-height: 92vh;
  display: flex; flex-direction: column;
  box-shadow: 0 10px 40px rgba(0,0,0,0.25);
}
.importer-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 20px; border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.importer-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 4px; }
.importer-subtitle { font-size: 0.875rem; color: var(--color-text-muted, #6b7280); margin: 0; }
.importer-body {
  overflow-y: auto; padding: 16px 20px; flex: 1;
  display: flex; flex-direction: column; gap: 16px;
}
.importer-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 16px 20px; border-top: 1px solid var(--color-border, #e5e7eb);
}

.element-card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-bg-subtle, #fafafa);
  display: flex; flex-direction: column; gap: 12px;
}
.element-card-header {
  display: flex; justify-content: space-between; align-items: center;
}
.element-index {
  font-weight: 700; color: var(--color-text-muted, #6b7280); font-size: 0.875rem;
}

.field-warn {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.7rem;
  font-weight: 500;
  color: #92400e;
  background: #fef3c7;
  border-radius: 999px;
  padding: 2px 8px;
  vertical-align: middle;
}

.form-row-2 { display: flex; gap: 12px; }
.list-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
.list-input-row .ds-input { flex: 1; }

.toggle-category {
  background: none; border: none; color: var(--color-primary, #2563eb);
  font-size: 0.8rem; cursor: pointer; padding: 0 8px;
}

.empty-state { text-align: center; color: var(--color-text-muted, #6b7280); padding: 40px; }

@media (max-width: 640px) {
  .form-row-2 { flex-direction: column; }
}
</style>

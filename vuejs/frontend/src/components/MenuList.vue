<script setup>
import { onMounted, ref, computed } from 'vue';
import { useStore } from 'vuex';
import Modal from '@/components/Modal.vue';
import Skeleton from '@/components/Skeleton.vue';
import { API_BASE } from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;

const emit = defineEmits(['AddElement', 'count-changed', 'RequestImport', 'element-updated']);

const initialLoading = ref(true);
const modalShow = ref(false);
const toModify = ref(null);
const imagePreview = ref(null);
const image = ref(null);
const uploadedImageId = ref(null);
const searchQuery = ref('');
const filterCategory = ref('');
const deletingIds = ref(new Set());

// Multi-select
const selected = ref(new Set());
const editingPriceId = ref(null);
const pendingPrice = ref('');

const list = ref([]);
const categories = ref([]);

const filteredList = computed(() => {
  let result = list.value;
  if (filterCategory.value) {
    result = result.filter(el => el.category === filterCategory.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(el => el.name.toLowerCase().includes(q));
  }
  return result;
});

const syncListMeta = () => {
  categories.value = [...new Set(list.value.map(el => el.category))];
  emit('count-changed', list.value.length);
};

const readErrorMessage = async (response, fallback) => {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || payload?.message || fallback;
};

const uploadImage = async () => {
  if (!image.value) return;
  const formData = new FormData();
  formData.append('files', image.value);
  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tkn}` },
      body: formData,
    });
    if (!response.ok) throw new Error(await readErrorMessage(response, 'Upload immagine non riuscito.'));
    const result = await response.json();
    uploadedImageId.value = result[0]?.id ?? null;
    toModify.value.image = { ...(toModify.value.image || {}), id: uploadedImageId.value };
  } catch (error) {
    console.error(error?.message || error);
  }
};

const fetchList = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/menus`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response, 'Errore nel recupero del menu.'));
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      list.value = data.data[0].fk_elements || [];
      syncListMeta();
    } else {
      list.value = [];
      categories.value = [];
      emit('count-changed', 0);
    }
  } catch (error) {
    console.error(error);
  } finally {
    initialLoading.value = false;
  }
};

const handleModify = (e) => {
  modalShow.value = true;
  toModify.value = JSON.parse(JSON.stringify(e));
  imagePreview.value = null;
};

const update = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/elements/${toModify.value.documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
      body: JSON.stringify({
        data: {
          name: toModify.value.name,
          ingredients: toModify.value.ingredients,
          allergens: toModify.value.allergens,
          image: toModify.value.image?.id ?? null,
          price: toModify.value.price,
          category: toModify.value.category,
          is_beverage: !!toModify.value.is_beverage,
        },
      }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Errore durante l'aggiornamento."));
    modalShow.value = false;
    imagePreview.value = null;
    await fetchList();
    emit('element-updated');
  } catch (error) {
    console.error(error);
  }
};

// Inline price edit
const startPriceEdit = (el) => {
  editingPriceId.value = el.documentId;
  pendingPrice.value = el.price.toFixed(2);
};

const commitPriceEdit = async (el) => {
  const newPrice = parseFloat(pendingPrice.value);
  if (!isNaN(newPrice) && newPrice !== el.price) {
    try {
      const res = await fetch(`${API_BASE}/api/elements/${el.documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
        body: JSON.stringify({ data: { price: newPrice } }),
      });
      if (res.ok) {
        el.price = newPrice;
        emit('element-updated');
      }
    } catch (error) {
      console.error(error);
    }
  }
  editingPriceId.value = null;
};

const cancelPriceEdit = () => { editingPriceId.value = null; };

const handlePriceKeydown = (e, el) => {
  if (e.key === 'Enter') { e.preventDefault(); commitPriceEdit(el); }
  if (e.key === 'Escape') { e.preventDefault(); cancelPriceEdit(); }
};

// Selection
const toggleSelect = (id) => {
  const s = new Set(selected.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selected.value = s;
};
const clearSelection = () => { selected.value = new Set(); };

// Bulk delete
const bulkDelete = async () => {
  const ids = [...selected.value];
  if (!ids.length) return;
  const prev = [...list.value];
  list.value = list.value.filter(el => !selected.value.has(el.documentId));
  selected.value = new Set();
  syncListMeta();
  try {
    await Promise.all(ids.map(id =>
      fetch(`${API_BASE}/api/elements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tkn}` },
      }).then(r => { if (!r.ok && r.status !== 204) throw new Error(); })
    ));
  } catch {
    list.value = prev;
    syncListMeta();
  }
};

const handleDelete = async (id) => {
  if (deletingIds.value.has(id)) return;
  const prev = [...list.value];
  deletingIds.value = new Set([...deletingIds.value, id]);
  list.value = list.value.filter(el => el.documentId !== id);
  syncListMeta();
  try {
    const res = await fetch(`${API_BASE}/api/elements/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tkn}` },
    });
    if (!res.ok && res.status !== 204) throw new Error(await readErrorMessage(res, 'Errore eliminazione.'));
  } catch (error) {
    list.value = prev;
    syncListMeta();
    console.error(error);
  } finally {
    const d = new Set(deletingIds.value);
    d.delete(id);
    deletingIds.value = d;
  }
};

const addIngredient = () => toModify.value.ingredients.push('');
const removeIngredient = (i) => toModify.value.ingredients.splice(i, 1);
const addAllergen = () => toModify.value.allergens.push('');
const removeAllergen = (i) => toModify.value.allergens.splice(i, 1);

const getImageUrl = (obj) => {
  if (!obj) return '';
  if (obj.formats?.thumbnail) return `${API_BASE}${obj.formats.thumbnail.url}`;
  return `${API_BASE}${obj.url}`;
};

const handleFile = async (event) => {
  const file = event.target.files[0];
  if (file) {
    image.value = file;
    const reader = new FileReader();
    reader.onload = () => { imagePreview.value = reader.result; };
    reader.readAsDataURL(file);
  }
  await uploadImage();
};

onMounted(async () => {
  document.title = 'Gestione Menu';
  await fetchList();
});

defineExpose({ refresh: fetchList });
</script>

<template>
  <div class="ml-root">

    <!-- Bulk-bar (appare quando ci sono elementi selezionati) -->
    <Transition name="bulk-bar">
      <div v-if="selected.size > 0" class="ml-bulk-bar" role="status">
        <span class="ml-bulk-count">{{ selected.size }} selezionat{{ selected.size === 1 ? 'o' : 'i' }}</span>
        <div class="ml-bulk-actions">
          <button type="button" class="ml-bulk-btn ml-bulk-btn--danger" @click="bulkDelete">
            <i class="bi bi-trash"></i> Elimina
          </button>
          <button type="button" class="ml-bulk-btn" @click="clearSelection">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
    </Transition>

    <div class="ml-container">
      <!-- Header -->
      <div class="ml-header">
        <div class="ml-header-left">
          <h2 class="ml-title">I tuoi elementi</h2>
          <span v-if="list.length > 0" class="ds-badge ds-badge-primary">{{ list.length }}</span>
        </div>
        <div class="ml-header-actions">
          <button type="button" @click="emit('RequestImport')" class="ds-btn ds-btn-secondary">
            <i class="bi bi-file-earmark-arrow-up"></i>
            <span>Importa da PDF/Immagine</span>
          </button>
          <button type="button" @click="emit('AddElement')" class="ds-btn ds-btn-primary">
            <i class="bi bi-plus-lg"></i>
            <span>Aggiungi</span>
          </button>
        </div>
      </div>

      <!-- Filtri: search + category chips -->
      <div v-if="list.length > 0" class="ml-filters">
        <div class="ml-search-wrap">
          <i class="bi bi-search ml-search-icon" aria-hidden="true"></i>
          <input
            v-model="searchQuery"
            type="text"
            class="ds-input ml-search-input"
            placeholder="Cerca per nome…"
            aria-label="Cerca elementi"
          >
        </div>
        <div class="ml-chips" role="group" aria-label="Filtra per categoria">
          <button
            type="button"
            class="ml-chip"
            :class="{ 'ml-chip--active': filterCategory === '' }"
            @click="filterCategory = ''"
          >Tutte</button>
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="ml-chip"
            :class="{ 'ml-chip--active': filterCategory === cat }"
            @click="filterCategory = filterCategory === cat ? '' : cat"
          >{{ cat }}</button>
        </div>
      </div>

      <!-- Skeleton -->
      <div v-if="initialLoading" class="ml-grid">
        <div v-for="n in 6" :key="`sk-${n}`" class="ds-card ml-card">
          <div class="ml-card-img" style="background: var(--bg-sunk);">
            <Skeleton width="100%" height="100%" radius="0" />
          </div>
          <div class="ml-card-body">
            <div class="ml-card-row">
              <Skeleton width="55%" height="16px" />
              <Skeleton width="45px" height="14px" />
            </div>
            <Skeleton width="40%" height="11px" style="margin-top: 8px;" />
            <Skeleton width="100%" height="10px" style="margin-top: 12px;" />
            <Skeleton width="80%" height="10px" style="margin-top: 4px;" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="list.length === 0" class="ds-card">
        <div class="ds-empty">
          <div class="ds-empty-icon"><i class="bi bi-journal-x"></i></div>
          <p class="ds-empty-title">Nessun elemento nel menu</p>
          <p class="ds-empty-description">Inizia aggiungendo il primo elemento al tuo menu.</p>
          <button type="button" @click="emit('AddElement')" class="ds-btn ds-btn-primary">
            <i class="bi bi-plus-lg"></i> <span>Aggiungi il primo elemento</span>
          </button>
        </div>
      </div>

      <!-- Grid -->
      <div v-if="!initialLoading && list.length > 0" class="ml-grid">
        <div
          v-for="element in filteredList"
          :key="element.documentId"
          class="ds-card ml-card"
          :class="{ 'ml-card--selected': selected.has(element.documentId) }"
        >
          <!-- Checkbox top-left -->
          <button
            type="button"
            class="ml-checkbox"
            :class="{ 'ml-checkbox--checked': selected.has(element.documentId) }"
            :aria-pressed="selected.has(element.documentId)"
            :aria-label="selected.has(element.documentId) ? 'Deseleziona' : 'Seleziona'"
            @click.stop="toggleSelect(element.documentId)"
          >
            <i v-if="selected.has(element.documentId)" class="bi bi-check-lg" aria-hidden="true"></i>
          </button>

          <!-- Quick actions top-right -->
          <div class="ml-quick-actions" aria-label="Azioni rapide">
            <button
              type="button"
              class="ml-action-btn"
              title="Modifica"
              aria-label="Modifica elemento"
              @click.stop="handleModify(element)"
            ><i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button
              type="button"
              class="ml-action-btn ml-action-btn--danger"
              title="Elimina"
              aria-label="Elimina elemento"
              :disabled="deletingIds.has(element.documentId)"
              @click.stop="handleDelete(element.documentId)"
            >
              <span v-if="deletingIds.has(element.documentId)" class="ds-spinner ds-spinner-sm" aria-hidden="true"></span>
              <i v-else class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>

          <!-- Image -->
          <div class="ml-card-img">
            <img v-if="element.image" :src="getImageUrl(element.image)" class="ml-img" :alt="element.name">
            <div v-else class="ml-img-placeholder" aria-hidden="true"><i class="bi bi-image"></i></div>
          </div>

          <div class="ml-card-body">
            <div class="ml-card-row">
              <h3 class="ml-el-name">{{ element.name }}</h3>
              <!-- Inline price edit -->
              <button
                v-if="editingPriceId !== element.documentId"
                type="button"
                class="ml-price"
                title="Clicca per modificare il prezzo"
                @click.stop="startPriceEdit(element)"
              >{{ element.price.toFixed(2) }} &euro;</button>
              <input
                v-else
                :value="pendingPrice"
                @input="pendingPrice = $event.target.value"
                @blur="commitPriceEdit(element)"
                @keydown="handlePriceKeydown($event, element)"
                type="number"
                step="0.01"
                min="0"
                class="ml-price-input"
                aria-label="Modifica prezzo"
                autofocus
              >
            </div>
            <span class="ds-badge ds-badge-neutral">{{ element.category }}</span>

            <div v-if="element.ingredients && element.ingredients.length" class="ml-detail">
              <span class="ml-detail-label">Ingredienti</span>
              <p class="ml-detail-text">{{ element.ingredients.join(', ') }}</p>
            </div>
            <div v-if="element.allergens && element.allergens.length" class="ml-detail">
              <span class="ml-detail-label ml-detail-label--danger">Allergeni</span>
              <p class="ml-detail-text ml-detail-text--danger">{{ element.allergens.join(', ') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <Modal :show="modalShow" @close="modalShow = false">
      <template #title>
        <h3 class="modal-edit-title">
          <i class="bi bi-pencil" aria-hidden="true"></i>
          Modifica elemento
        </h3>
      </template>
      <template #body>
        <form v-if="toModify" @submit.prevent="update" class="edit-form">
          <div class="edit-form-row">
            <div class="ds-field" style="flex: 1;">
              <label class="ds-label">Nome</label>
              <input type="text" v-model="toModify.name" class="ds-input" required>
            </div>
            <div class="ds-field" style="width: 140px;">
              <label class="ds-label">Prezzo</label>
              <div class="price-input-wrap">
                <input type="number" v-model="toModify.price" class="ds-input" step="0.01" required>
                <span class="price-suffix">&euro;</span>
              </div>
            </div>
          </div>

          <div class="ds-field">
            <label class="ds-label">Ingredienti</label>
            <div v-for="(ing, idx) in toModify.ingredients" :key="idx" class="list-input-row">
              <input v-model="toModify.ingredients[idx]" class="ds-input" required>
              <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeIngredient(idx)">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addIngredient">
              <i class="bi bi-plus" aria-hidden="true"></i> Aggiungi ingrediente
            </button>
          </div>

          <div class="ds-field">
            <label class="ds-label">Allergeni</label>
            <div v-for="(alg, idx) in toModify.allergens" :key="idx" class="list-input-row">
              <input v-model="toModify.allergens[idx]" class="ds-input" required>
              <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeAllergen(idx)">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addAllergen">
              <i class="bi bi-plus" aria-hidden="true"></i> Aggiungi allergene
            </button>
          </div>

          <div class="ds-field">
            <label class="ds-label">Categoria</label>
            <select v-model="toModify.category" class="ds-input ds-select" required>
              <option>Bevande</option>
              <option>Dessert</option>
              <option>Pizze classiche</option>
              <option>Pizze bianche</option>
              <option>Pizze rosse</option>
              <option>Primi</option>
              <option>Secondi</option>
              <option>Primi di pesce</option>
              <option>Secondi di pesce</option>
              <option>Contorni</option>
            </select>
          </div>

          <div class="ds-field bev-toggle-field">
            <label class="bev-toggle-row">
              <input type="checkbox" v-model="toModify.is_beverage" class="bev-toggle-input">
              <span class="bev-toggle-track"><span class="bev-toggle-thumb"></span></span>
              <span class="bev-toggle-label">
                <strong>Questa è una bevanda</strong>
                <span class="bev-toggle-hint">Se attivo, l'elemento appare nella tab Bevande e contribuisce al turno bar.</span>
              </span>
            </label>
          </div>

          <div class="ds-field">
            <label class="ds-label">Immagine</label>
            <label class="file-upload-area" tabindex="0">
              <input type="file" accept="image/*" @change="handleFile" class="file-upload-hidden">
              <div v-if="!imagePreview && !toModify.image" class="file-upload-content">
                <i class="bi bi-cloud-arrow-up file-upload-icon" aria-hidden="true"></i>
                <span class="file-upload-text">Clicca per selezionare un'immagine</span>
              </div>
              <div v-else class="file-upload-preview">
                <img v-if="imagePreview" :src="imagePreview" alt="Nuova anteprima" class="image-preview">
                <img v-else-if="toModify.image" :src="getImageUrl(toModify.image)" alt="Immagine attuale" class="image-preview">
                <span class="file-upload-change">Clicca per cambiare</span>
              </div>
            </label>
          </div>

          <button type="submit" class="ds-btn ds-btn-primary" style="width: 100%;">
            <i class="bi bi-check2" aria-hidden="true"></i> Conferma modifica
          </button>
        </form>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.ml-root { position: relative; }

/* ── Bulk bar ── */
.ml-bulk-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: var(--ink);
  color: var(--bg);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-md);
}
.ml-bulk-count { font-variant-numeric: tabular-nums; }
.ml-bulk-actions { display: flex; align-items: center; gap: 6px; }
.ml-bulk-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--bg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--dur-fast);
}
.ml-bulk-btn:hover { background: color-mix(in oklab, white 15%, transparent); }
.ml-bulk-btn--danger { color: oklch(0.78 0.16 22); }
.ml-bulk-btn--danger:hover { background: color-mix(in oklab, oklch(0.78 0.16 22) 15%, transparent); }

.bulk-bar-enter-active, .bulk-bar-leave-active { transition: transform 200ms var(--ease-out), opacity 160ms; }
.bulk-bar-enter-from, .bulk-bar-leave-to { transform: translateY(-100%); opacity: 0; }

/* ── Container ── */
.ml-container {
  padding: var(--s-8) 0;
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 28px var(--s-8);
}

/* ── Header ── */
.ml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.ml-header-left { display: flex; align-items: center; gap: 12px; }
.ml-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
  letter-spacing: -0.02em;
}
.ml-header-actions { display: flex; gap: 10px; }

/* ── Filters ── */
.ml-filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.ml-search-wrap {
  position: relative;
  max-width: 360px;
}
.ml-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-3);
  font-size: 13px;
  pointer-events: none;
}
.ml-search-input { padding-left: 34px; }

.ml-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ml-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast), color var(--dur-fast);
  white-space: nowrap;
}
.ml-chip:hover { border-color: var(--ink-3); color: var(--ink); }
.ml-chip--active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--bg);
}

/* ── Grid ── */
.ml-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

/* ── Card ── */
.ml-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast), border-color var(--dur-fast);
}
.ml-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.ml-card--selected {
  border-color: var(--ac) !important;
  box-shadow: 0 0 0 3px var(--ac-soft) !important;
}

/* Checkbox */
.ml-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1.5px solid var(--line-strong);
  background: var(--paper);
  color: var(--ac-contrast);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 11px;
  z-index: 2;
  opacity: 0;
  transition: opacity var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.ml-card:hover .ml-checkbox,
.ml-checkbox--checked { opacity: 1; }
.ml-checkbox--checked {
  border-color: var(--ac);
  background: var(--ac);
}

/* Quick actions */
.ml-quick-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
  z-index: 2;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.ml-card:hover .ml-quick-actions { opacity: 1; }

.ml-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 12px;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
  box-shadow: var(--shadow-xs);
}
.ml-action-btn:hover { background: var(--bg-hover); color: var(--ink); border-color: var(--line-strong); }
.ml-action-btn--danger:hover { background: color-mix(in oklab, var(--danger) 10%, var(--paper)); color: var(--danger); border-color: color-mix(in oklab, var(--danger) 30%, transparent); }

/* Card image */
.ml-card-img {
  height: 120px;
  overflow: hidden;
  background: var(--bg-sunk);
  flex-shrink: 0;
}
.ml-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--dur-slow);
}
.ml-card:hover .ml-img { transform: scale(1.04); }
.ml-img-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-4);
  font-size: 24px;
}

/* Card body */
.ml-card-body {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ml-card-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.ml-el-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* Inline price */
.ml-price {
  font-size: 13px;
  font-weight: 600;
  color: var(--ac-ink);
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: none;
  cursor: text;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--dur-fast);
}
.ml-price:hover {
  background: var(--bg-sunk);
}
.ml-price-input {
  width: 72px;
  padding: 2px 6px;
  border: 1.5px solid var(--ac);
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  font-family: var(--f-mono);
  background: var(--paper);
  color: var(--ink);
  outline: none;
  flex-shrink: 0;
}

.ml-detail { margin-top: 2px; }
.ml-detail-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
}
.ml-detail-label--danger { color: var(--danger); }
.ml-detail-text {
  font-size: 11.5px;
  color: var(--ink-3);
  margin: 2px 0 0;
  line-height: 1.4;
}
.ml-detail-text--danger { color: var(--danger); }

/* Modal */
.modal-edit-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 17px; font-weight: 600; margin: 0;
}
.edit-form { display: flex; flex-direction: column; }
.edit-form-row { display: flex; gap: 16px; }
.price-input-wrap { position: relative; }
.price-input-wrap .ds-input { padding-right: 32px; }
.price-suffix {
  position: absolute; right: 12px; top: 50%;
  transform: translateY(-50%);
  color: var(--ink-3); font-size: 13px;
}
.list-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
.list-input-row .ds-input { flex: 1; }

.file-upload-area {
  display: flex; align-items: center; justify-content: center;
  border: 2px dashed var(--line);
  border-radius: var(--r-md);
  padding: 16px; cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast);
  min-height: 80px;
}
.file-upload-area:hover,
.file-upload-area:focus-within { border-color: var(--ac); background: var(--ac-soft); }
.file-upload-hidden { position: absolute; width: 0; height: 0; opacity: 0; overflow: hidden; }
.file-upload-content { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.file-upload-icon { font-size: 20px; color: var(--ink-3); }
.file-upload-text { font-size: 13px; color: var(--ink-3); }
.file-upload-preview { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.file-upload-change { font-size: 11px; color: var(--ac); }
.image-preview { border-radius: var(--r-md); border: 1px solid var(--line); max-height: 100px; }

.bev-toggle-field { margin: 4px 0 2px; }
.bev-toggle-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg-sunk);
  cursor: pointer;
  transition: border-color 160ms;
}
.bev-toggle-row:hover { border-color: var(--ac); }
.bev-toggle-input { position: absolute; opacity: 0; pointer-events: none; }
.bev-toggle-track {
  position: relative;
  width: 38px; height: 22px; flex-shrink: 0;
  background: var(--line);
  border-radius: 999px;
  transition: background 160ms;
  margin-top: 2px;
}
.bev-toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 160ms;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.bev-toggle-input:checked + .bev-toggle-track { background: var(--ac); }
.bev-toggle-input:checked + .bev-toggle-track .bev-toggle-thumb { transform: translateX(16px); }
.bev-toggle-label { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.bev-toggle-label strong { color: var(--ink); font-weight: 600; }
.bev-toggle-hint { color: var(--ink-3); font-size: 12.5px; line-height: 1.4; }

/* Responsive */
@media (max-width: 1024px) {
  .ml-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .ml-grid { grid-template-columns: 1fr; }
  .ml-container { padding: 20px 16px; }
  .ml-header { flex-direction: column; align-items: flex-start; }
}
</style>

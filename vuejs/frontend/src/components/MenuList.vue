<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
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
const editingNameId = ref(null);
const pendingName = ref('');
const editingCategoryId = ref(null);
const showBulkCategoryMenu = ref(false);
const duplicatingIds = ref(new Set());

const PREDEFINED_CATEGORIES = [
  'Bevande',
  'Dessert',
  'Pizze classiche',
  'Pizze bianche',
  'Pizze rosse',
  'Primi',
  'Secondi',
  'Primi di pesce',
  'Secondi di pesce',
  'Contorni',
];

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

// Array paralleli di uid stabili per ingredienti/allergeni dentro la modale.
// Senza, :key="idx" sull'<input> dei row fa sì che Vue riusi i nodi DOM in
// base alla posizione: dopo una rimozione/aggiunta i valori "saltano" tra
// le righe e l'utente non riesce ad aggiungere un ingrediente perché il
// display rimane disallineato dallo stato reale.
let nextUid = 0;
const newUid = () => {
  nextUid += 1;
  return nextUid;
};
const ingredientUids = ref([]);
const allergenUids = ref([]);

const handleModify = (e) => {
  modalShow.value = true;
  toModify.value = JSON.parse(JSON.stringify(e));
  ingredientUids.value = (toModify.value.ingredients || []).map(() => newUid());
  allergenUids.value = (toModify.value.allergens || []).map(() => newUid());
  imagePreview.value = null;
};

// Modale ridotta: nome/prezzo/categoria/is_beverage si modificano inline
// dalla card. La modale ora salva solo immagine + ingredienti + allergeni.
const update = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/elements/${toModify.value.documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
      body: JSON.stringify({
        data: {
          ingredients: toModify.value.ingredients,
          allergens: toModify.value.allergens,
          image: toModify.value.image?.id ?? null,
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

// Helper PUT generico per inline edit (nome / categoria).
const patchElement = async (el, dataPatch) => {
  const res = await fetch(`${API_BASE}/api/elements/${el.documentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
    body: JSON.stringify({ data: dataPatch }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Errore durante l'aggiornamento."));
};

// Duplica un elemento. POST con payload identico + suffisso "(copia)" sul nome.
const duplicate = async (el) => {
  if (duplicatingIds.value.has(el.documentId)) return;
  duplicatingIds.value = new Set([...duplicatingIds.value, el.documentId]);
  try {
    const payload = {
      name: `${el.name} (copia)`,
      price: el.price,
      category: el.category,
      ingredients: Array.isArray(el.ingredients) ? [...el.ingredients] : [],
      allergens: Array.isArray(el.allergens) ? [...el.allergens] : [],
      image: el.image?.id ?? null,
      is_beverage: !!el.is_beverage,
    };
    const res = await fetch(`${API_BASE}/api/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Duplicazione non riuscita.'));
    await fetchList();
    emit('element-updated');
  } catch (error) {
    console.error(error);
  } finally {
    const d = new Set(duplicatingIds.value);
    d.delete(el.documentId);
    duplicatingIds.value = d;
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

// Inline name edit: click sul nome → input → blur/Enter salva via PUT, Esc annulla.
const startNameEdit = (el) => {
  editingNameId.value = el.documentId;
  pendingName.value = el.name;
};

const commitNameEdit = async (el) => {
  const next = String(pendingName.value || '').trim();
  if (next && next !== el.name) {
    try {
      await patchElement(el, { name: next });
      el.name = next;
      emit('element-updated');
    } catch (error) {
      console.error(error);
    }
  }
  editingNameId.value = null;
};

const cancelNameEdit = () => { editingNameId.value = null; };
const handleNameKeydown = (e, el) => {
  if (e.key === 'Enter') { e.preventDefault(); commitNameEdit(el); }
  if (e.key === 'Escape') { e.preventDefault(); cancelNameEdit(); }
};

// Inline category edit: click sul badge → dropdown.
const startCategoryEdit = (el) => { editingCategoryId.value = el.documentId; };
const cancelCategoryEdit = () => { editingCategoryId.value = null; };
const commitCategoryEdit = async (el, cat) => {
  if (cat && cat !== el.category) {
    try {
      await patchElement(el, { category: cat });
      el.category = cat;
      syncListMeta();
      emit('element-updated');
    } catch (error) {
      console.error(error);
    }
  }
  editingCategoryId.value = null;
};

// Categorie disponibili = predefinite + quelle realmente esistenti nel menu.
const availableCategories = computed(() => {
  const fromList = categories.value.filter((c) => c && !PREDEFINED_CATEGORIES.includes(c));
  return [...PREDEFINED_CATEGORIES, ...fromList];
});

// Selection
const toggleSelect = (id) => {
  const s = new Set(selected.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selected.value = s;
};
const clearSelection = () => { selected.value = new Set(); };

// Bulk duplicate: duplica tutti gli elementi selezionati con suffisso "(copia)".
const bulkDuplicate = async () => {
  const ids = [...selected.value];
  if (!ids.length) return;
  const elementsToDup = list.value.filter((el) => selected.value.has(el.documentId));
  selected.value = new Set();
  try {
    await Promise.all(elementsToDup.map((el) => {
      const payload = {
        name: `${el.name} (copia)`,
        price: el.price,
        category: el.category,
        ingredients: Array.isArray(el.ingredients) ? [...el.ingredients] : [],
        allergens: Array.isArray(el.allergens) ? [...el.allergens] : [],
        image: el.image?.id ?? null,
        is_beverage: !!el.is_beverage,
      };
      return fetch(`${API_BASE}/api/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({ data: payload }),
      });
    }));
    await fetchList();
    emit('element-updated');
  } catch (error) {
    console.error(error);
  }
};

// Bulk move-category: sposta tutti i selezionati nella categoria scelta.
const bulkMoveCategory = async (newCategory) => {
  const ids = [...selected.value];
  if (!ids.length || !newCategory) return;
  const elementsToMove = list.value.filter((el) => selected.value.has(el.documentId));
  showBulkCategoryMenu.value = false;
  try {
    await Promise.all(elementsToMove.map((el) =>
      fetch(`${API_BASE}/api/elements/${el.documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({ data: { category: newCategory } }),
      }),
    ));
    elementsToMove.forEach((el) => { el.category = newCategory; });
    syncListMeta();
    selected.value = new Set();
    emit('element-updated');
  } catch (error) {
    console.error(error);
  }
};

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

const addIngredient = () => {
  toModify.value.ingredients.push('');
  ingredientUids.value.push(newUid());
};
const removeIngredient = (i) => {
  toModify.value.ingredients.splice(i, 1);
  ingredientUids.value.splice(i, 1);
};
const addAllergen = () => {
  toModify.value.allergens.push('');
  allergenUids.value.push(newUid());
};
const removeAllergen = (i) => {
  toModify.value.allergens.splice(i, 1);
  allergenUids.value.splice(i, 1);
};

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

// Click-outside per chiudere dropdown bulk-categoria + inline category popover.
const handleDocClick = (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (showBulkCategoryMenu.value && !t.closest('.ml-bulk-cat-wrap')) {
    showBulkCategoryMenu.value = false;
  }
  if (editingCategoryId.value && !t.closest('.ml-cat-wrap')) {
    editingCategoryId.value = null;
  }
};

onMounted(async () => {
  document.title = 'Gestione Menu';
  document.addEventListener('click', handleDocClick);
  await fetchList();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick);
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
          <div class="ml-bulk-cat-wrap">
            <button
              type="button"
              class="ml-bulk-btn"
              :aria-expanded="showBulkCategoryMenu"
              @click="showBulkCategoryMenu = !showBulkCategoryMenu"
            >
              <i class="bi bi-tags"></i>
              <span>Sposta categoria</span>
              <i class="bi bi-chevron-down ml-bulk-chev"></i>
            </button>
            <Transition name="bulk-menu">
              <div v-if="showBulkCategoryMenu" class="ml-bulk-menu" role="menu">
                <button
                  v-for="cat in availableCategories"
                  :key="cat"
                  type="button"
                  class="ml-bulk-menu-item"
                  role="menuitem"
                  @click="bulkMoveCategory(cat)"
                >{{ cat }}</button>
              </div>
            </Transition>
          </div>
          <button type="button" class="ml-bulk-btn" @click="bulkDuplicate">
            <i class="bi bi-files"></i>
            <span>Duplica</span>
          </button>
          <button type="button" class="ml-bulk-btn ml-bulk-btn--danger" @click="bulkDelete">
            <i class="bi bi-trash"></i>
            <span>Elimina</span>
          </button>
          <button type="button" class="ml-bulk-btn" aria-label="Chiudi selezione" @click="clearSelection">
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

          <!-- Quick actions top-right (sempre visibili) -->
          <div class="ml-quick-actions" aria-label="Azioni rapide">
            <button
              type="button"
              class="ml-action-btn"
              title="Modifica immagine, ingredienti e allergeni"
              aria-label="Modifica elemento"
              @click.stop="handleModify(element)"
            ><i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button
              type="button"
              class="ml-action-btn"
              title="Duplica"
              aria-label="Duplica elemento"
              :disabled="duplicatingIds.has(element.documentId)"
              @click.stop="duplicate(element)"
            >
              <span v-if="duplicatingIds.has(element.documentId)" class="ds-spinner ds-spinner-sm" aria-hidden="true"></span>
              <i v-else class="bi bi-files" aria-hidden="true"></i>
            </button>
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
              <!-- Inline name edit -->
              <button
                v-if="editingNameId !== element.documentId"
                type="button"
                class="ml-el-name ml-el-name-btn"
                title="Clicca per modificare il nome"
                @click.stop="startNameEdit(element)"
              >{{ element.name }}</button>
              <input
                v-else
                :value="pendingName"
                @input="pendingName = $event.target.value"
                @blur="commitNameEdit(element)"
                @keydown="handleNameKeydown($event, element)"
                type="text"
                class="ml-name-input"
                aria-label="Modifica nome"
                autofocus
              />
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
            <!-- Inline category edit: click sul badge → dropdown -->
            <div class="ml-cat-wrap">
              <button
                v-if="editingCategoryId !== element.documentId"
                type="button"
                class="ds-badge ds-badge-neutral ml-cat-btn"
                title="Clicca per cambiare categoria"
                @click.stop="startCategoryEdit(element)"
              >{{ element.category }}</button>
              <div v-else class="ml-cat-popover" @click.stop>
                <button
                  v-for="cat in availableCategories"
                  :key="cat"
                  type="button"
                  class="ml-cat-item"
                  :class="{ 'ml-cat-item--active': cat === element.category }"
                  @click="commitCategoryEdit(element, cat)"
                >{{ cat }}</button>
                <button type="button" class="ml-cat-cancel" @click="cancelCategoryEdit">Annulla</button>
              </div>
            </div>

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

    <!-- Edit modal: solo immagine + ingredienti + allergeni.
         Nome / prezzo / categoria / is_beverage si modificano inline dalla card. -->
    <Modal :show="modalShow" @close="modalShow = false">
      <template #title>
        <h3 class="modal-edit-title">
          <i class="bi bi-pencil" aria-hidden="true"></i>
          Modifica dettagli
        </h3>
      </template>
      <template #body>
        <form v-if="toModify" @submit.prevent="update" class="edit-form">
          <p class="edit-form-hint">
            Nome, prezzo, categoria e flag bevanda si modificano direttamente
            sulla card cliccando sul valore. Qui aggiorni solo immagine,
            ingredienti e allergeni.
          </p>

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

          <div class="ds-field">
            <label class="ds-label">Ingredienti</label>
            <div v-for="(_ing, idx) in toModify.ingredients" :key="ingredientUids[idx]" class="list-input-row">
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
            <div v-for="(_alg, idx) in toModify.allergens" :key="allergenUids[idx]" class="list-input-row">
              <input v-model="toModify.allergens[idx]" class="ds-input" required>
              <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeAllergen(idx)">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addAllergen">
              <i class="bi bi-plus" aria-hidden="true"></i> Aggiungi allergene
            </button>
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
.ml-bulk-chev { font-size: 10px; opacity: 0.7; margin-left: 2px; }

.ml-bulk-cat-wrap { position: relative; }
.ml-bulk-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 6px;
  z-index: 30;
  max-height: 280px;
  overflow-y: auto;
}
.ml-bulk-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: background var(--dur-fast);
}
.ml-bulk-menu-item:hover { background: var(--bg-hover); }

.bulk-bar-enter-active, .bulk-bar-leave-active { transition: transform 200ms var(--ease-out), opacity 160ms; }
.bulk-bar-enter-from, .bulk-bar-leave-to { transform: translateY(-100%); opacity: 0; }
.bulk-menu-enter-active, .bulk-menu-leave-active { transition: opacity 140ms, transform 160ms; }
.bulk-menu-enter-from, .bulk-menu-leave-to { opacity: 0; transform: translateY(-4px); }

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

/* Checkbox: sempre visibile (opacity 0.5 idle, 1 hover/selezionato). */
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
  opacity: 0.5;
  transition: opacity var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.ml-card:hover .ml-checkbox,
.ml-checkbox:hover,
.ml-checkbox--checked { opacity: 1; }
.ml-checkbox--checked {
  border-color: var(--ac);
  background: var(--ac);
}

/* Quick actions: sempre visibili (opacity 0.5 idle, 1 hover). */
.ml-quick-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
  z-index: 2;
  opacity: 0.5;
  transition: opacity var(--dur-fast);
}
.ml-card:hover .ml-quick-actions,
.ml-quick-actions:hover,
.ml-quick-actions:focus-within { opacity: 1; }

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
.ml-el-name-btn {
  background: transparent;
  border: none;
  text-align: left;
  cursor: text;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: inherit;
  transition: background var(--dur-fast);
}
.ml-el-name-btn:hover { background: var(--bg-hover); }
.ml-name-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 1.5px solid var(--ac);
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  background: var(--paper);
  color: var(--ink);
  outline: none;
  box-shadow: 0 0 0 3px var(--ac-soft);
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

/* Inline category edit */
.ml-cat-wrap { position: relative; display: inline-block; }
.ml-cat-btn {
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: background var(--dur-fast);
}
.ml-cat-btn:hover { background: var(--bg-elev); }
.ml-cat-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 12;
  min-width: 200px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  max-height: 240px;
  overflow-y: auto;
}
.ml-cat-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 12.5px;
  border-radius: 5px;
  cursor: pointer;
}
.ml-cat-item:hover { background: var(--bg-hover); }
.ml-cat-item--active { background: var(--ac-soft); color: var(--ac-ink); }
.ml-cat-cancel {
  display: block;
  width: 100%;
  padding: 6px 10px;
  margin-top: 2px;
  border: none;
  border-top: 1px solid var(--line);
  background: transparent;
  color: var(--ink-3);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: center;
}
.ml-cat-cancel:hover { color: var(--ink); }

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
.edit-form { display: flex; flex-direction: column; gap: 12px; }
.edit-form-hint {
  margin: 0 0 8px;
  padding: 10px 12px;
  background: var(--bg-sunk);
  border-left: 3px solid var(--ac);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--ink-2);
  line-height: 1.45;
}
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

<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { fetchMenuElements, orderErrorMessage } from '@/utils';
import { useStore } from 'vuex';

const props = defineProps({
    show: { type: Boolean, default: false },
    orderDocumentId: { type: String, default: null },
    lockVersion: { type: Number, default: 0 },
});

const emit = defineEmits(['close', 'add']);

const store = useStore();

const tab = ref('menu');
const menuElements = ref([]);
const menuLoading = ref(false);
const menuError = ref('');
const searchQuery = ref('');

// Form libero
const freeForm = ref({ name: '', price: '', quantity: 1, notes: '' });
const freeErrors = ref({});

// Selezione da menu
const selectedElement = ref(null);
const menuQty = ref(1);
const menuNotes = ref('');

watch(() => props.show, async (v) => {
    if (!v) return;
    // Reset
    tab.value = 'menu';
    selectedElement.value = null;
    menuQty.value = 1;
    menuNotes.value = '';
    freeForm.value = { name: '', price: '', quantity: 1, notes: '' };
    freeErrors.value = {};
    searchQuery.value = '';
    menuError.value = '';

    await loadMenu();
});

const loadMenu = async () => {
    const user = store.getters.getUser;
    if (!user?.documentId) return;
    menuLoading.value = true;
    menuError.value = '';
    try {
        const data = await fetchMenuElements(user.documentId);
        const menuData = data?.data?.[0]?.fk_elements || [];
        menuElements.value = menuData;
    } catch (_err) {
        menuError.value = 'Errore nel caricamento del menu.';
    } finally {
        menuLoading.value = false;
    }
};

const filteredElements = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return menuElements.value;
    return menuElements.value.filter(el =>
        el.name?.toLowerCase().includes(q) ||
        el.category?.toLowerCase().includes(q)
    );
});

const groupedByCategory = computed(() => {
    const groups = {};
    for (const el of filteredElements.value) {
        const cat = el.category || 'Altro';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(el);
    }
    return groups;
});

const selectElement = (el) => {
    selectedElement.value = el;
    menuQty.value = 1;
    menuNotes.value = '';
};

const confirmMenuAdd = () => {
    if (!selectedElement.value) return;
    emit('add', {
        element_id: selectedElement.value.documentId,
        quantity: menuQty.value,
        notes: menuNotes.value.trim() || undefined,
        lock_version: props.lockVersion,
    });
};

const validateFree = () => {
    const errs = {};
    if (!freeForm.value.name.trim()) errs.name = 'Inserisci il nome.';
    const p = parseFloat(freeForm.value.price);
    if (!Number.isFinite(p) || p < 0) errs.price = 'Inserisci un prezzo valido.';
    const q = parseInt(freeForm.value.quantity, 10);
    if (!Number.isFinite(q) || q < 1) errs.quantity = 'Quantita minima: 1.';
    freeErrors.value = errs;
    return Object.keys(errs).length === 0;
};

const confirmFreeAdd = () => {
    if (!validateFree()) return;
    emit('add', {
        name: freeForm.value.name.trim(),
        price: parseFloat(freeForm.value.price),
        quantity: parseInt(freeForm.value.quantity, 10),
        notes: freeForm.value.notes.trim() || undefined,
        lock_version: props.lockVersion,
    });
};

const onClose = () => {
    emit('close');
};
</script>

<template>
    <Modal :show="show" @close="onClose">
        <template #title>
            <div class="modal-title-wrap">
                <i class="bi bi-plus-circle" aria-hidden="true"></i>
                <h2 class="modal-title">Aggiungi piatto</h2>
            </div>
        </template>

        <template #body>
            <!-- Tab switcher -->
            <div class="aim-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    :aria-selected="tab === 'menu'"
                    :class="['aim-tab', { active: tab === 'menu' }]"
                    @click="tab = 'menu'"
                >
                    <i class="bi bi-journal-text" aria-hidden="true"></i>
                    Da menu
                </button>
                <button
                    type="button"
                    role="tab"
                    :aria-selected="tab === 'free'"
                    :class="['aim-tab', { active: tab === 'free' }]"
                    @click="tab = 'free'"
                >
                    <i class="bi bi-pencil-square" aria-hidden="true"></i>
                    Libero
                </button>
            </div>

            <!-- Tab: Da menu -->
            <div v-if="tab === 'menu'" class="aim-menu-panel">
                <div v-if="menuLoading" class="aim-loading">
                    <span class="ds-spinner" aria-hidden="true"></span>
                    <span>Caricamento menu...</span>
                </div>
                <div v-else-if="menuError" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                    <span>{{ menuError }}</span>
                </div>
                <template v-else>
                    <!-- Ricerca -->
                    <div class="aim-search">
                        <i class="bi bi-search aim-search-icon" aria-hidden="true"></i>
                        <input
                            type="text"
                            v-model="searchQuery"
                            class="ds-input aim-search-input"
                            placeholder="Cerca piatto o categoria..."
                        >
                    </div>

                    <!-- Selezione elemento -->
                    <div v-if="!selectedElement" class="aim-list">
                        <div v-if="filteredElements.length === 0" class="aim-no-results">
                            Nessun piatto trovato.
                        </div>
                        <template v-for="(items, category) in groupedByCategory" :key="category">
                            <div class="aim-category">{{ category }}</div>
                            <button
                                v-for="el in items"
                                :key="el.documentId"
                                type="button"
                                class="aim-element"
                                @click="selectElement(el)"
                            >
                                <span class="aim-el-name">{{ el.name }}</span>
                                <span class="aim-el-price">&euro; {{ parseFloat(el.price).toFixed(2) }}</span>
                            </button>
                        </template>
                    </div>

                    <!-- Dettaglio selezione -->
                    <div v-else class="aim-selected">
                        <div class="aim-selected-header">
                            <button type="button" class="aim-back" @click="selectedElement = null">
                                <i class="bi bi-arrow-left" aria-hidden="true"></i>
                                Indietro
                            </button>
                        </div>
                        <div class="aim-selected-info">
                            <span class="aim-selected-name">{{ selectedElement.name }}</span>
                            <span class="aim-selected-price">&euro; {{ parseFloat(selectedElement.price).toFixed(2) }}</span>
                        </div>
                        <div class="form-row-2">
                            <div class="ds-field">
                                <label class="ds-label" for="aim-menu-qty">Quantita</label>
                                <input
                                    id="aim-menu-qty"
                                    v-model.number="menuQty"
                                    type="number"
                                    min="1"
                                    class="ds-input"
                                >
                            </div>
                            <div class="ds-field">
                                <label class="ds-label" for="aim-menu-notes">Note</label>
                                <input
                                    id="aim-menu-notes"
                                    v-model="menuNotes"
                                    type="text"
                                    class="ds-input"
                                    placeholder="Es. senza cipolla"
                                >
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="ds-btn ds-btn-ghost" @click="selectedElement = null">
                                Annulla
                            </button>
                            <button type="button" class="ds-btn ds-btn-primary" @click="confirmMenuAdd">
                                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                                Aggiungi
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Tab: Libero -->
            <div v-if="tab === 'free'" class="aim-free-panel">
                <form @submit.prevent="confirmFreeAdd" novalidate>
                    <div class="ds-field">
                        <label class="ds-label" for="aim-free-name">Nome *</label>
                        <input
                            id="aim-free-name"
                            v-model="freeForm.name"
                            type="text"
                            class="ds-input"
                            placeholder="Es. Acqua naturale"
                            :aria-invalid="!!freeErrors.name"
                        >
                        <p v-if="freeErrors.name" class="ds-helper aim-err">{{ freeErrors.name }}</p>
                    </div>
                    <div class="form-row-2">
                        <div class="ds-field">
                            <label class="ds-label" for="aim-free-price">Prezzo *</label>
                            <input
                                id="aim-free-price"
                                v-model="freeForm.price"
                                type="number"
                                min="0"
                                step="0.01"
                                class="ds-input"
                                placeholder="0.00"
                                :aria-invalid="!!freeErrors.price"
                            >
                            <p v-if="freeErrors.price" class="ds-helper aim-err">{{ freeErrors.price }}</p>
                        </div>
                        <div class="ds-field">
                            <label class="ds-label" for="aim-free-qty">Quantita *</label>
                            <input
                                id="aim-free-qty"
                                v-model.number="freeForm.quantity"
                                type="number"
                                min="1"
                                class="ds-input"
                                :aria-invalid="!!freeErrors.quantity"
                            >
                            <p v-if="freeErrors.quantity" class="ds-helper aim-err">{{ freeErrors.quantity }}</p>
                        </div>
                    </div>
                    <div class="ds-field">
                        <label class="ds-label" for="aim-free-notes">Note</label>
                        <input
                            id="aim-free-notes"
                            v-model="freeForm.notes"
                            type="text"
                            class="ds-input"
                            placeholder="Opzionale"
                        >
                    </div>
                    <div class="form-actions">
                        <button type="button" class="ds-btn ds-btn-ghost" @click="onClose">
                            Annulla
                        </button>
                        <button type="submit" class="ds-btn ds-btn-primary">
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                            Aggiungi
                        </button>
                    </div>
                </form>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
.modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
}
.modal-title-wrap i {
    font-size: 18px;
    color: var(--ac);
}
.modal-title {
    margin: 0;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
}

.aim-tabs {
    display: flex;
    gap: 2px;
    padding: 4px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    margin-bottom: var(--s-4);
}
.aim-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    background: transparent;
    border: none;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: background 120ms, color 120ms, box-shadow 120ms;
}
.aim-tab:hover { color: var(--ink); }
.aim-tab.active {
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}

.aim-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    padding: var(--s-7);
    color: var(--ink-3);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
}

.aim-search {
    position: relative;
    margin-bottom: var(--s-3);
}
.aim-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    pointer-events: none;
}
.aim-search-input {
    padding-left: 36px;
}

.aim-list {
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--paper);
}
.aim-category {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 10px 14px 6px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 1;
}
.aim-element {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    font-family: var(--f-sans, 'Geist', sans-serif);
    transition: background 120ms, color 120ms;
    text-align: left;
    width: 100%;
}
.aim-element:hover {
    background: color-mix(in oklab, var(--ac) 6%, var(--paper));
}
.aim-el-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
}
.aim-el-price {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--ac);
    flex-shrink: 0;
}

.aim-no-results {
    padding: var(--s-6);
    text-align: center;
    color: var(--ink-3);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
}

.aim-selected {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
}
.aim-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    color: var(--ac);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
}
.aim-back:hover { text-decoration: underline; }
.aim-selected-info {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-2);
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.aim-selected-name {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
}
.aim-selected-price {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 16px;
    font-weight: 700;
    color: var(--ac);
    letter-spacing: -0.01em;
}

.form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-4);
}
.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
    margin-top: var(--s-2);
}
.aim-err {
    color: var(--dan);
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    margin-top: 4px;
}

@media (max-width: 640px) {
    .form-row-2 {
        grid-template-columns: 1fr;
        gap: 0;
    }
    .form-actions {
        flex-direction: column-reverse;
    }
    .form-actions :deep(.ds-btn) {
        width: 100%;
    }
}
</style>

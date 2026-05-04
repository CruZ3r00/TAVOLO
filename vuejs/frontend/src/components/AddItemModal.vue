<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { fetchMenuElements, orderErrorMessage } from '@/utils';
import { useStore } from 'vuex';
import { effectiveUserDocumentId } from '@/staffAccess';

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
const selectedCategory = ref('all');
const selectedCourse = ref(1);

// Form libero
const freeForm = ref({ name: '', price: '', quantity: 1, category: 'Altro', notes: '' });
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
    freeForm.value = { name: '', price: '', quantity: 1, category: 'Altro', notes: '' };
    freeErrors.value = {};
    searchQuery.value = '';
    selectedCategory.value = 'all';
    selectedCourse.value = 1;
    menuError.value = '';

    await loadMenu();
});

const loadMenu = async () => {
    const user = store.getters.getUser;
    const menuOwnerDocumentId = effectiveUserDocumentId(user);
    if (!menuOwnerDocumentId) return;
    menuLoading.value = true;
    menuError.value = '';
    try {
        const data = await fetchMenuElements(menuOwnerDocumentId);
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
    return menuElements.value.filter(el => {
        const cat = el.category || 'Altro';
        const matchesCategory = selectedCategory.value === 'all' || cat === selectedCategory.value;
        const matchesSearch = !q ||
            el.name?.toLowerCase().includes(q) ||
            cat.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
    });
});

const categoryCounts = computed(() => {
    const counts = new Map();
    for (const el of menuElements.value) {
        const cat = el.category || 'Altro';
        counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'it'))
        .map(([name, count]) => ({ name, count }));
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

const courseOptions = computed(() => {
    const visibleMax = Math.min(12, Math.max(4, selectedCourse.value));
    return Array.from({ length: visibleMax }, (_v, index) => index + 1);
});

const courseLabel = (course) => `${course}a portata`;

const increaseCourse = () => {
    selectedCourse.value = Math.min(12, selectedCourse.value + 1);
};

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
        course: selectedCourse.value,
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
    if (freeForm.value.category && freeForm.value.category.trim().length > 100) {
        errs.category = 'Categoria troppo lunga.';
    }
    freeErrors.value = errs;
    return Object.keys(errs).length === 0;
};

const confirmFreeAdd = () => {
    if (!validateFree()) return;
    emit('add', {
        name: freeForm.value.name.trim(),
        price: parseFloat(freeForm.value.price),
        quantity: parseInt(freeForm.value.quantity, 10),
        category: freeForm.value.category.trim() || 'Altro',
        course: selectedCourse.value,
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

            <div class="aim-course">
                <span class="aim-course-label">
                    <i class="bi bi-layers" aria-hidden="true"></i>
                    Portata
                </span>
                <div class="aim-course-options" role="group" aria-label="Portata">
                    <button
                        v-for="course in courseOptions"
                        :key="course"
                        type="button"
                        :class="['aim-course-btn', { active: selectedCourse === course }]"
                        @click="selectedCourse = course"
                    >
                        {{ courseLabel(course) }}
                    </button>
                    <button
                        type="button"
                        class="aim-course-btn aim-course-add"
                        :disabled="selectedCourse >= 12"
                        @click="increaseCourse"
                        aria-label="Aggiungi portata successiva"
                    >
                        <i class="bi bi-plus-lg" aria-hidden="true"></i>
                    </button>
                </div>
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

                    <div v-if="categoryCounts.length" class="aim-category-filter" aria-label="Filtra categorie">
                        <button
                            type="button"
                            :class="['aim-filter-chip', { active: selectedCategory === 'all' }]"
                            @click="selectedCategory = 'all'"
                        >
                            Tutto
                            <span>{{ menuElements.length }}</span>
                        </button>
                        <button
                            v-for="cat in categoryCounts"
                            :key="cat.name"
                            type="button"
                            :class="['aim-filter-chip', { active: selectedCategory === cat.name }]"
                            @click="selectedCategory = cat.name"
                        >
                            {{ cat.name }}
                            <span>{{ cat.count }}</span>
                        </button>
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
                            <span class="aim-selected-meta">
                                <span>{{ selectedElement.category || 'Altro' }}</span>
                                <strong>&euro; {{ parseFloat(selectedElement.price).toFixed(2) }}</strong>
                            </span>
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
                        <label class="ds-label" for="aim-free-category">Categoria</label>
                        <input
                            id="aim-free-category"
                            v-model="freeForm.category"
                            type="text"
                            class="ds-input"
                            placeholder="Es. Bevande"
                            :aria-invalid="!!freeErrors.category"
                        >
                        <p v-if="freeErrors.category" class="ds-helper aim-err">{{ freeErrors.category }}</p>
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

.aim-course {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--paper);
    margin-bottom: var(--s-4);
}
.aim-course-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
}
.aim-course-label i { color: var(--ac); }
.aim-course-options {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
}
.aim-course-btn {
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg-2);
    color: var(--ink-2);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
}
.aim-course-btn:hover:not(:disabled) {
    color: var(--ink);
    border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
}
.aim-course-btn.active {
    background: var(--ac);
    color: white;
    border-color: var(--ac);
}
.aim-course-add {
    width: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.aim-course-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

.aim-category-filter {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: var(--s-3);
    margin-bottom: var(--s-1);
}
.aim-filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--paper);
    color: var(--ink-2);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 120ms, color 120ms, border-color 120ms;
}
.aim-filter-chip span {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: inherit;
    opacity: 0.75;
}
.aim-filter-chip:hover {
    color: var(--ink);
    border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
}
.aim-filter-chip.active {
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-color: color-mix(in oklab, var(--ac) 45%, var(--line));
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
.aim-selected-meta {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    flex-shrink: 0;
}
.aim-selected-meta span {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
}
.aim-selected-meta strong {
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
    .aim-course {
        align-items: flex-start;
        flex-direction: column;
    }
    .aim-course-options {
        justify-content: flex-start;
    }
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

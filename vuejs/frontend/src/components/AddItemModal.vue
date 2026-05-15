<script setup>
// AddItemModal (nonostante il nome legacy): vista FULL-PAGE per aggiungere
// item a un ordine in Sala. Si monta in luogo della grid tavoli quando il
// parent attiva la view (pattern MenuSetter -> MenuAdder).
//
// Layout: header con back button + breadcrumb + titolo, body con sezioni
// numerate, sticky bottom con 3 azioni:
//   - Annulla: torna alla sala (emit 'cancel')
//   - Aggiungi un altro: emette 'add' con keepOpen=true (resta nella view,
//     resetta nome/qty/notes ma MANTIENE la portata corrente per inserire
//     velocemente piatti diversi della stessa portata)
//   - Aggiungi e torna alla sala: emit 'add' con keepOpen=false
//
// Reset dei campi item dopo un add riuscito: il parent chiama via ref
// `resetItemFields()` quando l'API success.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fetchMenuElements } from '@/utils';
import { useStore } from 'vuex';
import { effectiveUserDocumentId } from '@/staffAccess';

const props = defineProps({
    orderDocumentId: { type: String, default: null },
    lockVersion: { type: Number, default: 0 },
    tableLabel: { type: String, default: '' },
    submitting: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel', 'add']);

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

const resetMenuItemFields = () => {
    selectedElement.value = null;
    menuQty.value = 1;
    menuNotes.value = '';
};
const resetFreeItemFields = () => {
    freeForm.value = { name: '', price: '', quantity: 1, category: freeForm.value.category || 'Altro', notes: '' };
    freeErrors.value = {};
};

/**
 * Reset SOLO dei campi del piatto (nome/qty/notes/selected element).
 * Mantiene portata corrente, tab attiva, search/categoria. Esposto al parent
 * via ref: viene chiamato dopo un add riuscito quando l'utente ha scelto
 * "Aggiungi un altro".
 */
const resetItemFields = () => {
    resetMenuItemFields();
    resetFreeItemFields();
    searchQuery.value = '';
};
defineExpose({ resetItemFields });

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

// Reset completo quando cambia l'ordine (es. parent monta il componente per
// un altro tavolo).
watch(() => props.orderDocumentId, () => {
    tab.value = 'menu';
    resetItemFields();
    selectedCourse.value = 1;
    selectedCategory.value = 'all';
});

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
const clearSelectedElement = () => {
    selectedElement.value = null;
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

const canSubmit = computed(() => {
    if (props.submitting) return false;
    if (tab.value === 'menu') return !!selectedElement.value && menuQty.value >= 1;
    return true;
});

const buildPayload = () => {
    if (tab.value === 'menu') {
        if (!selectedElement.value) return null;
        return {
            element_id: selectedElement.value.documentId,
            quantity: menuQty.value,
            course: selectedCourse.value,
            notes: menuNotes.value.trim() || undefined,
            lock_version: props.lockVersion,
        };
    }
    if (!validateFree()) return null;
    return {
        name: freeForm.value.name.trim(),
        price: parseFloat(freeForm.value.price),
        quantity: parseInt(freeForm.value.quantity, 10),
        category: freeForm.value.category.trim() || 'Altro',
        course: selectedCourse.value,
        notes: freeForm.value.notes.trim() || undefined,
        lock_version: props.lockVersion,
    };
};

const onAddAndContinue = () => {
    const payload = buildPayload();
    if (!payload) return;
    emit('add', { payload, keepOpen: true });
};
const onAddAndClose = () => {
    const payload = buildPayload();
    if (!payload) return;
    emit('add', { payload, keepOpen: false });
};

const onCancel = () => emit('cancel');

const onKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
};

onMounted(async () => {
    if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown);
    await loadMenu();
});
onBeforeUnmount(() => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
});

const breadcrumbContext = computed(() => props.tableLabel || 'Ordine');
const sectionDetailsTitle = computed(() => (
    tab.value === 'menu' && selectedElement.value
        ? `Quantità e note · ${selectedElement.value.name}`
        : 'Quantità e note'
));
</script>

<template>
    <div class="aip-shell">
        <!-- Header: back + breadcrumb + titolo -->
        <header class="aip-head">
            <button
                type="button"
                class="aip-back-btn"
                aria-label="Torna alla sala"
                @click="onCancel"
            >
                <i class="bi bi-arrow-left" aria-hidden="true"></i>
            </button>
            <div class="aip-head-block">
                <nav class="aip-crumbs" aria-label="breadcrumb">
                    <span class="aip-crumb">Sala</span>
                    <span class="aip-crumb-sep" aria-hidden="true">/</span>
                    <span class="aip-crumb">{{ breadcrumbContext }}</span>
                    <span class="aip-crumb-sep" aria-hidden="true">/</span>
                    <span class="aip-crumb aip-crumb--current">Aggiungi piatto</span>
                </nav>
                <h1 class="aip-title">Aggiungi al tavolo</h1>
                <p class="aip-subtitle">
                    Seleziona dal menu o inserisci una voce libera. Aggiungi più piatti
                    consecutivi senza tornare alla sala — la portata resta selezionata.
                </p>
            </div>
        </header>

        <!-- Body sezioni numerate -->
        <div class="aip-body">
            <!-- 1 · Portata -->
            <section class="aip-section">
                <aside class="aip-section-head">
                    <div class="aip-section-num-row">
                        <span class="aip-section-num">1</span>
                        <h2 class="aip-section-title">Portata</h2>
                    </div>
                    <p class="aip-section-sub">In quale momento del servizio va questo piatto?</p>
                </aside>
                <div class="aip-section-body">
                    <div class="aip-course-options" role="group" aria-label="Portata">
                        <button
                            v-for="course in courseOptions"
                            :key="course"
                            type="button"
                            class="aip-chip"
                            :class="{ 'aip-chip--active': selectedCourse === course }"
                            @click="selectedCourse = course"
                        >{{ courseLabel(course) }}</button>
                        <button
                            type="button"
                            class="aip-chip aip-chip--icon"
                            :disabled="selectedCourse >= 12"
                            aria-label="Aggiungi portata successiva"
                            @click="increaseCourse"
                        >
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </section>

            <!-- 2 · Origine -->
            <section class="aip-section">
                <aside class="aip-section-head">
                    <div class="aip-section-num-row">
                        <span class="aip-section-num">2</span>
                        <h2 class="aip-section-title">Origine</h2>
                    </div>
                    <p class="aip-section-sub">
                        Scegli un piatto già nel menu o crea una voce al volo (utile per fuori-menu).
                    </p>
                </aside>
                <div class="aip-section-body">
                    <div class="aip-tabs" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            :aria-selected="tab === 'menu'"
                            class="aip-tab"
                            :class="{ 'aip-tab--active': tab === 'menu' }"
                            @click="tab = 'menu'; clearSelectedElement()"
                        >
                            <i class="bi bi-journal-text" aria-hidden="true"></i>
                            <span>Da menu</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            :aria-selected="tab === 'free'"
                            class="aip-tab"
                            :class="{ 'aip-tab--active': tab === 'free' }"
                            @click="tab = 'free'"
                        >
                            <i class="bi bi-pencil-square" aria-hidden="true"></i>
                            <span>Libero</span>
                        </button>
                    </div>

                    <div v-if="tab === 'menu'" class="aip-menu-panel">
                        <div v-if="menuLoading" class="aip-loading">
                            <span class="ds-spinner" aria-hidden="true"></span>
                            <span>Caricamento menu…</span>
                        </div>
                        <div v-else-if="menuError" class="aip-banner aip-banner--error">
                            <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                            <span>{{ menuError }}</span>
                        </div>
                        <template v-else>
                            <div v-if="!selectedElement">
                                <div class="aip-search">
                                    <i class="bi bi-search aip-search-icon" aria-hidden="true"></i>
                                    <input
                                        v-model="searchQuery"
                                        type="text"
                                        class="aip-input aip-input--search"
                                        placeholder="Cerca piatto o categoria…"
                                    />
                                </div>

                                <div v-if="categoryCounts.length" class="aip-chip-row" aria-label="Filtra categorie">
                                    <button
                                        type="button"
                                        class="aip-chip"
                                        :class="{ 'aip-chip--active': selectedCategory === 'all' }"
                                        @click="selectedCategory = 'all'"
                                    >
                                        Tutto
                                        <span class="aip-chip-count">{{ menuElements.length }}</span>
                                    </button>
                                    <button
                                        v-for="cat in categoryCounts"
                                        :key="cat.name"
                                        type="button"
                                        class="aip-chip"
                                        :class="{ 'aip-chip--active': selectedCategory === cat.name }"
                                        @click="selectedCategory = cat.name"
                                    >
                                        {{ cat.name }}
                                        <span class="aip-chip-count">{{ cat.count }}</span>
                                    </button>
                                </div>

                                <div class="aip-list">
                                    <div v-if="filteredElements.length === 0" class="aip-empty">
                                        Nessun piatto trovato.
                                    </div>
                                    <template v-for="(items, category) in groupedByCategory" :key="category">
                                        <div class="aip-list-cat">{{ category }}</div>
                                        <button
                                            v-for="el in items"
                                            :key="el.documentId"
                                            type="button"
                                            class="aip-list-item"
                                            @click="selectElement(el)"
                                        >
                                            <span class="aip-list-name">{{ el.name }}</span>
                                            <span class="aip-list-price">€ {{ parseFloat(el.price).toFixed(2) }}</span>
                                        </button>
                                    </template>
                                </div>
                            </div>

                            <div v-else class="aip-selected">
                                <div class="aip-selected-card">
                                    <div class="aip-selected-info">
                                        <span class="aip-selected-name">{{ selectedElement.name }}</span>
                                        <span class="aip-selected-cat">{{ selectedElement.category || 'Altro' }}</span>
                                    </div>
                                    <span class="aip-selected-price">€ {{ parseFloat(selectedElement.price).toFixed(2) }}</span>
                                </div>
                                <button type="button" class="aip-link-btn" @click="clearSelectedElement">
                                    ← Cambia piatto
                                </button>
                            </div>
                        </template>
                    </div>

                    <div v-else class="aip-free-panel">
                        <div class="aip-row-2">
                            <div class="aip-field" style="flex: 2;">
                                <label class="aip-label" for="aip-free-name">Nome *</label>
                                <input
                                    id="aip-free-name"
                                    v-model="freeForm.name"
                                    type="text"
                                    class="aip-input"
                                    placeholder="Es. Acqua naturale"
                                    :aria-invalid="!!freeErrors.name"
                                />
                                <p v-if="freeErrors.name" class="aip-err">{{ freeErrors.name }}</p>
                            </div>
                            <div class="aip-field" style="flex: 1;">
                                <label class="aip-label" for="aip-free-price">Prezzo *</label>
                                <div class="aip-input-suffix-wrap">
                                    <input
                                        id="aip-free-price"
                                        v-model="freeForm.price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        class="aip-input"
                                        placeholder="0.00"
                                        :aria-invalid="!!freeErrors.price"
                                    />
                                    <span class="aip-input-suffix">€</span>
                                </div>
                                <p v-if="freeErrors.price" class="aip-err">{{ freeErrors.price }}</p>
                            </div>
                        </div>
                        <div class="aip-field">
                            <label class="aip-label" for="aip-free-category">Categoria</label>
                            <input
                                id="aip-free-category"
                                v-model="freeForm.category"
                                type="text"
                                class="aip-input"
                                placeholder="Es. Bevande"
                                :aria-invalid="!!freeErrors.category"
                            />
                            <p v-if="freeErrors.category" class="aip-err">{{ freeErrors.category }}</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 3 · Dettagli -->
            <section
                v-if="tab === 'free' || (tab === 'menu' && selectedElement)"
                class="aip-section"
            >
                <aside class="aip-section-head">
                    <div class="aip-section-num-row">
                        <span class="aip-section-num">3</span>
                        <h2 class="aip-section-title">Dettagli</h2>
                    </div>
                    <p class="aip-section-sub">{{ sectionDetailsTitle }}</p>
                </aside>
                <div class="aip-section-body">
                    <div class="aip-row-2">
                        <div class="aip-field" style="flex: 1;">
                            <label class="aip-label" :for="tab === 'menu' ? 'aip-menu-qty' : 'aip-free-qty'">
                                Quantità *
                            </label>
                            <input
                                v-if="tab === 'menu'"
                                id="aip-menu-qty"
                                v-model.number="menuQty"
                                type="number"
                                min="1"
                                class="aip-input"
                            />
                            <input
                                v-else
                                id="aip-free-qty"
                                v-model.number="freeForm.quantity"
                                type="number"
                                min="1"
                                class="aip-input"
                                :aria-invalid="!!freeErrors.quantity"
                            />
                            <p v-if="tab === 'free' && freeErrors.quantity" class="aip-err">{{ freeErrors.quantity }}</p>
                        </div>
                        <div class="aip-field" style="flex: 2;">
                            <label class="aip-label" :for="tab === 'menu' ? 'aip-menu-notes' : 'aip-free-notes'">
                                Note
                            </label>
                            <input
                                v-if="tab === 'menu'"
                                id="aip-menu-notes"
                                v-model="menuNotes"
                                type="text"
                                class="aip-input"
                                placeholder="Es. senza cipolla"
                            />
                            <input
                                v-else
                                id="aip-free-notes"
                                v-model="freeForm.notes"
                                type="text"
                                class="aip-input"
                                placeholder="Opzionale"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <!-- Sticky bottom bar: 3 azioni -->
        <footer class="aip-foot">
            <div class="aip-foot-left">
                <span class="aip-foot-tag">
                    <i class="bi bi-layers" aria-hidden="true"></i>
                    {{ courseLabel(selectedCourse) }}
                </span>
                <span class="aip-foot-hint">
                    Aggiungi più piatti della stessa portata senza chiudere.
                </span>
            </div>
            <button type="button" class="aip-btn aip-btn--ghost" :disabled="submitting" @click="onCancel">
                Annulla
            </button>
            <button
                type="button"
                class="aip-btn aip-btn--secondary"
                :disabled="!canSubmit"
                @click="onAddAndContinue"
            >
                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                <span>Aggiungi un altro</span>
            </button>
            <button
                type="button"
                class="aip-btn aip-btn--primary"
                :disabled="!canSubmit"
                @click="onAddAndClose"
            >
                <i class="bi bi-check2" aria-hidden="true"></i>
                <span>Aggiungi e torna alla sala</span>
            </button>
        </footer>
    </div>
</template>

<style scoped>
.aip-shell {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 100px);
    background: var(--bg);
    color: var(--ink);
    font-family: var(--f-sans);
    position: relative;
}

/* ─────────────── Header ─────────────── */
.aip-head {
    flex-shrink: 0;
    padding: 18px 28px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    display: flex;
    align-items: flex-start;
    gap: 14px;
}
.aip-back-btn {
    width: 36px; height: 36px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
    display: grid; place-items: center;
    transition: background var(--dur-fast), color var(--dur-fast);
    flex-shrink: 0;
    margin-top: 14px;
}
.aip-back-btn:hover { background: var(--bg-hover); color: var(--ink); }
.aip-back-btn i { font-size: 16px; }
.aip-head-block { flex: 1; min-width: 0; }
.aip-crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 8px;
}
.aip-crumb { color: var(--ink-3); }
.aip-crumb--current { color: var(--ink); font-weight: 600; }
.aip-crumb-sep { color: var(--ink-3); opacity: 0.6; }
.aip-title {
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--ink);
}
.aip-subtitle {
    margin: 4px 0 0;
    font-size: 13.5px;
    color: var(--ink-3);
    line-height: 1.45;
}

/* ─────────────── Body + Sezioni ─────────────── */
.aip-body { flex: 1; min-height: 0; padding-bottom: 80px; }

.aip-section {
    display: flex;
    gap: 24px;
    padding: 22px 28px;
    border-bottom: 1px solid var(--line);
}
.aip-section:last-child { border-bottom: none; }
.aip-section-head { width: 220px; flex-shrink: 0; padding-top: 4px; }
.aip-section-num-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.aip-section-num {
    width: 22px; height: 22px;
    border-radius: 6px;
    background: var(--ink);
    color: var(--bg);
    display: grid; place-items: center;
    font-family: var(--f-mono);
    font-weight: 700;
    font-size: 11px;
    flex-shrink: 0;
}
.aip-section-title { margin: 0; font-size: 14.5px; font-weight: 650; color: var(--ink); }
.aip-section-sub { margin: 0; font-size: 12.5px; color: var(--ink-3); line-height: 1.45; }
.aip-section-body { flex: 1; min-width: 0; }

/* ─────────────── Field ─────────────── */
.aip-row-2 { display: flex; gap: 14px; margin-bottom: 14px; }
.aip-row-2:last-child { margin-bottom: 0; }
.aip-field { display: flex; flex-direction: column; }
.aip-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin-bottom: 6px; }
.aip-input {
    width: 100%; height: 40px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); color: var(--ink);
    font-family: inherit; font-size: 14px; outline: none;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.aip-input:focus { border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }
.aip-input--search { padding-left: 36px; height: 38px; }
.aip-input-suffix-wrap { position: relative; }
.aip-input-suffix-wrap .aip-input { padding-right: 36px; }
.aip-input-suffix {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    color: var(--ink-3); font-size: 14px; pointer-events: none;
}
.aip-err { color: var(--danger); font-family: var(--f-mono); font-size: 12px; margin: 4px 0 0; }

/* ─────────────── Chip / Tab / Course ─────────────── */
.aip-course-options, .aip-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.aip-chip-row { margin-bottom: 12px; }
.aip-chip {
    display: inline-flex; align-items: center; gap: 7px;
    height: 36px; padding: 0 14px;
    border: 1px solid var(--line); border-radius: 999px;
    background: var(--bg); color: var(--ink-2);
    font-family: inherit; font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.aip-chip:hover:not(:disabled) { background: var(--bg-hover); }
.aip-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.aip-chip--active { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.aip-chip--icon { width: 36px; padding: 0; justify-content: center; }
.aip-chip-count { font-family: var(--f-mono); font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }

.aip-tabs {
    display: inline-flex; align-items: stretch; gap: 2px;
    padding: 4px;
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
    margin-bottom: 14px;
}
.aip-tab {
    appearance: none;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    background: transparent; border: none; border-radius: 7px;
    color: var(--ink-3); font-family: inherit;
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.aip-tab:hover { color: var(--ink); }
.aip-tab--active { background: var(--paper); color: var(--ink); font-weight: 600; box-shadow: var(--shadow-xs); }

.aip-link-btn {
    background: none; border: none; padding: 6px 0 0;
    color: var(--ac); font-family: inherit;
    font-size: 13px; font-weight: 500; cursor: pointer;
}
.aip-link-btn:hover { color: var(--ac-ink); }

/* ─────────────── Search ─────────────── */
.aip-search { position: relative; margin-bottom: 12px; }
.aip-search-icon {
    position: absolute; left: 12px; top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3); font-size: 14px; pointer-events: none;
}

/* ─────────────── Loading / Banners / Empty ─────────────── */
.aip-loading {
    display: flex; align-items: center; justify-content: center;
    gap: 10px; padding: 28px 16px;
    color: var(--ink-3); font-size: 14px;
}
.aip-banner {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 8px; font-size: 13px;
}
.aip-banner--error {
    background: color-mix(in oklab, var(--danger) 10%, var(--paper));
    color: var(--danger);
    border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
}
.aip-empty { padding: 24px 16px; text-align: center; color: var(--ink-3); font-size: 13px; }

/* ─────────────── Lista piatti ─────────────── */
.aip-list {
    max-height: 400px; overflow-y: auto;
    border: 1px solid var(--line); border-radius: 10px; background: var(--paper);
}
.aip-list-cat {
    font-family: var(--f-mono);
    font-size: 10px; font-weight: 600;
    color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.12em;
    padding: 10px 14px 6px;
    background: var(--bg-sunk); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 1;
}
.aip-list-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: transparent; border: none; border-bottom: 1px solid var(--line);
    cursor: pointer; font-family: inherit;
    text-align: left; width: 100%;
    transition: background var(--dur-fast);
}
.aip-list-item:last-child { border-bottom: none; }
.aip-list-item:hover { background: var(--bg-hover); }
.aip-list-name { font-size: 14px; font-weight: 500; color: var(--ink); }
.aip-list-price {
    font-family: var(--f-mono); font-size: 13px; font-weight: 700;
    color: var(--ac-ink, var(--ac)); flex-shrink: 0;
}

/* ─────────────── Selected card ─────────────── */
.aip-selected { display: flex; flex-direction: column; gap: 4px; }
.aip-selected-card {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: 14px 16px;
    background: var(--bg-sunk); border: 1px solid var(--line); border-radius: 10px;
}
.aip-selected-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.aip-selected-name { font-size: 15px; font-weight: 650; color: var(--ink); }
.aip-selected-cat {
    font-family: var(--f-mono); font-size: 11px;
    color: var(--ink-3); letter-spacing: 0.04em;
}
.aip-selected-price {
    font-family: var(--f-mono); font-size: 18px; font-weight: 700;
    color: var(--ac-ink, var(--ac)); flex-shrink: 0;
}

/* ─────────────── Sticky footer ─────────────── */
.aip-foot {
    position: sticky;
    bottom: 0; left: 0; right: 0;
    height: 64px;
    border-top: 1px solid var(--line);
    background: var(--paper);
    display: flex; align-items: center; gap: 10px;
    padding: 0 28px;
    z-index: 20;
}
.aip-foot-left { display: flex; align-items: center; gap: 12px; flex: 1; }
.aip-foot-tag {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--f-mono); font-size: 12px;
    color: var(--ink-2);
    padding: 4px 10px; background: var(--bg-sunk); border-radius: 999px;
}
.aip-foot-tag i { color: var(--ac); font-size: 13px; }
.aip-foot-hint { font-size: 12px; color: var(--ink-3); }

/* ─────────────── Buttons ─────────────── */
.aip-btn {
    appearance: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    height: 40px;
    padding: 0 16px;
    font-family: inherit; font-size: 14px; font-weight: 500;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--paper); color: var(--ink);
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.aip-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.aip-btn--ghost { background: var(--paper); color: var(--ink-2); }
.aip-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.aip-btn--secondary {
    background: var(--bg-elev);
    color: var(--ink);
    border-color: var(--line-strong, var(--line));
}
.aip-btn--secondary:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--ac);
    color: var(--ac);
}
.aip-btn--primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.aip-btn--primary:hover:not(:disabled) { background: var(--ac); border-color: var(--ac); }
.aip-btn i { font-size: 14px; }

/* ─────────────── Responsive ─────────────── */
@media (max-width: 980px) {
    .aip-section { flex-direction: column; gap: 12px; }
    .aip-section-head { width: 100%; padding-top: 0; }
}
@media (max-width: 640px) {
    .aip-head { padding: 14px 16px; }
    .aip-section { padding: 18px 16px; }
    .aip-row-2 { flex-direction: column; gap: 12px; }
    .aip-foot {
        flex-wrap: wrap;
        height: auto; min-height: 64px; padding: 12px 16px;
    }
    .aip-foot-hint { display: none; }
}
</style>

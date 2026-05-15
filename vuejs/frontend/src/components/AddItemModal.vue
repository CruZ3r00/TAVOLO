<script setup>
// AddItemModal: overlay full-screen per aggiungere un item a un ordine
// (modalità cameriere). Layout allineato a MenuAdder/BeverageAdvancedEditor:
// header con breadcrumb + close, sezioni numerate, sticky bottom bar.
//
// Funzionalità invariate:
// - 2 modalità: "Da menu" (selezione da catalogo) o "Libero" (free-form).
// - Selezione portata 1..12.
// - Quantità + note.
// - Emit `add` con payload come prima, `close` per chiusura.

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import TeleportCompat from '@/lib/compat/teleport.js';
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

let savedOverflow = '';

watch(() => props.show, async (v) => {
    if (typeof document !== 'undefined') {
        if (v) {
            savedOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = savedOverflow;
        }
    }
    if (!v) return;
    // Reset state alla riapertura
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

const onKeydown = (e) => {
    if (!props.show) return;
    if (e.key === 'Escape') { e.preventDefault(); emit('close'); }
};
if (typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeydown);
}
onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', onKeydown);
        document.body.style.overflow = savedOverflow;
    }
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
    if (tab.value === 'menu') return !!selectedElement.value && menuQty.value >= 1;
    return true; // validazione completa al click submit
});

const onPrimarySubmit = () => {
    if (tab.value === 'menu') {
        if (!selectedElement.value) return;
        emit('add', {
            element_id: selectedElement.value.documentId,
            quantity: menuQty.value,
            course: selectedCourse.value,
            notes: menuNotes.value.trim() || undefined,
            lock_version: props.lockVersion,
        });
        return;
    }
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

const onClose = () => emit('close');

const submitLabel = computed(() => (tab.value === 'menu' ? 'Aggiungi al tavolo' : 'Aggiungi voce libera'));
const sectionDetailsTitle = computed(() => (
    tab.value === 'menu' && selectedElement.value
        ? `Quantità e note · ${selectedElement.value.name}`
        : 'Quantità e note'
));
</script>

<template>
    <TeleportCompat to="body">
        <Transition name="aia-fade">
            <div
                v-if="show"
                class="aia-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="Aggiungi piatto"
                @click.self="onClose"
            >
                <div class="aia-shell">
                    <!-- Header: breadcrumb + titolo + close -->
                    <header class="aia-head">
                        <nav class="aia-crumbs" aria-label="breadcrumb">
                            <span class="aia-crumb">Sala</span>
                            <span class="aia-crumb-sep" aria-hidden="true">/</span>
                            <span class="aia-crumb">Ordine</span>
                            <span class="aia-crumb-sep" aria-hidden="true">/</span>
                            <span class="aia-crumb aia-crumb--current">Aggiungi piatto</span>
                        </nav>
                        <div class="aia-title-row">
                            <div class="aia-title-block">
                                <h1 class="aia-title">Aggiungi piatto</h1>
                                <p class="aia-subtitle">
                                    Selezionalo dal menu o inseriscine uno libero. Imposta portata,
                                    quantità ed eventuali note.
                                </p>
                            </div>
                            <button
                                type="button"
                                class="aia-close"
                                aria-label="Chiudi"
                                @click="onClose"
                            >
                                <i class="bi bi-x-lg" aria-hidden="true"></i>
                            </button>
                        </div>
                    </header>

                    <!-- Body scrollabile con sezioni numerate -->
                    <div class="aia-body">
                        <!-- 1 · Portata -->
                        <section class="aia-section">
                            <aside class="aia-section-head">
                                <div class="aia-section-num-row">
                                    <span class="aia-section-num">1</span>
                                    <h2 class="aia-section-title">Portata</h2>
                                </div>
                                <p class="aia-section-sub">In quale momento del servizio va questo piatto?</p>
                            </aside>
                            <div class="aia-section-body">
                                <div class="aia-course-options" role="group" aria-label="Portata">
                                    <button
                                        v-for="course in courseOptions"
                                        :key="course"
                                        type="button"
                                        class="aia-chip"
                                        :class="{ 'aia-chip--active': selectedCourse === course }"
                                        @click="selectedCourse = course"
                                    >{{ courseLabel(course) }}</button>
                                    <button
                                        type="button"
                                        class="aia-chip aia-chip--icon"
                                        :disabled="selectedCourse >= 12"
                                        aria-label="Aggiungi portata successiva"
                                        @click="increaseCourse"
                                    >
                                        <i class="bi bi-plus-lg" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                        </section>

                        <!-- 2 · Origine (Da menu / Libero) -->
                        <section class="aia-section">
                            <aside class="aia-section-head">
                                <div class="aia-section-num-row">
                                    <span class="aia-section-num">2</span>
                                    <h2 class="aia-section-title">Origine</h2>
                                </div>
                                <p class="aia-section-sub">
                                    Scegli un piatto già presente nel menu o crea una voce al volo
                                    (utile per fuori-menu).
                                </p>
                            </aside>
                            <div class="aia-section-body">
                                <div class="aia-tabs" role="tablist">
                                    <button
                                        type="button"
                                        role="tab"
                                        :aria-selected="tab === 'menu'"
                                        class="aia-tab"
                                        :class="{ 'aia-tab--active': tab === 'menu' }"
                                        @click="tab = 'menu'; clearSelectedElement()"
                                    >
                                        <i class="bi bi-journal-text" aria-hidden="true"></i>
                                        <span>Da menu</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        :aria-selected="tab === 'free'"
                                        class="aia-tab"
                                        :class="{ 'aia-tab--active': tab === 'free' }"
                                        @click="tab = 'free'"
                                    >
                                        <i class="bi bi-pencil-square" aria-hidden="true"></i>
                                        <span>Libero</span>
                                    </button>
                                </div>

                                <!-- Sub-pannello: Da menu -->
                                <div v-if="tab === 'menu'" class="aia-menu-panel">
                                    <div v-if="menuLoading" class="aia-loading">
                                        <span class="ds-spinner" aria-hidden="true"></span>
                                        <span>Caricamento menu…</span>
                                    </div>
                                    <div v-else-if="menuError" class="aia-banner aia-banner--error">
                                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                                        <span>{{ menuError }}</span>
                                    </div>
                                    <template v-else>
                                        <div v-if="!selectedElement">
                                            <div class="aia-search">
                                                <i class="bi bi-search aia-search-icon" aria-hidden="true"></i>
                                                <input
                                                    v-model="searchQuery"
                                                    type="text"
                                                    class="aia-input aia-input--search"
                                                    placeholder="Cerca piatto o categoria…"
                                                />
                                            </div>

                                            <div v-if="categoryCounts.length" class="aia-chip-row" aria-label="Filtra categorie">
                                                <button
                                                    type="button"
                                                    class="aia-chip"
                                                    :class="{ 'aia-chip--active': selectedCategory === 'all' }"
                                                    @click="selectedCategory = 'all'"
                                                >
                                                    Tutto
                                                    <span class="aia-chip-count">{{ menuElements.length }}</span>
                                                </button>
                                                <button
                                                    v-for="cat in categoryCounts"
                                                    :key="cat.name"
                                                    type="button"
                                                    class="aia-chip"
                                                    :class="{ 'aia-chip--active': selectedCategory === cat.name }"
                                                    @click="selectedCategory = cat.name"
                                                >
                                                    {{ cat.name }}
                                                    <span class="aia-chip-count">{{ cat.count }}</span>
                                                </button>
                                            </div>

                                            <div class="aia-list">
                                                <div v-if="filteredElements.length === 0" class="aia-empty">
                                                    Nessun piatto trovato.
                                                </div>
                                                <template v-for="(items, category) in groupedByCategory" :key="category">
                                                    <div class="aia-list-cat">{{ category }}</div>
                                                    <button
                                                        v-for="el in items"
                                                        :key="el.documentId"
                                                        type="button"
                                                        class="aia-list-item"
                                                        @click="selectElement(el)"
                                                    >
                                                        <span class="aia-list-name">{{ el.name }}</span>
                                                        <span class="aia-list-price">€ {{ parseFloat(el.price).toFixed(2) }}</span>
                                                    </button>
                                                </template>
                                            </div>
                                        </div>

                                        <div v-else class="aia-selected">
                                            <div class="aia-selected-card">
                                                <div class="aia-selected-info">
                                                    <span class="aia-selected-name">{{ selectedElement.name }}</span>
                                                    <span class="aia-selected-cat">{{ selectedElement.category || 'Altro' }}</span>
                                                </div>
                                                <span class="aia-selected-price">€ {{ parseFloat(selectedElement.price).toFixed(2) }}</span>
                                            </div>
                                            <button type="button" class="aia-link-btn" @click="clearSelectedElement">
                                                ← Cambia piatto
                                            </button>
                                        </div>
                                    </template>
                                </div>

                                <!-- Sub-pannello: Libero -->
                                <div v-else class="aia-free-panel">
                                    <div class="aia-row-2">
                                        <div class="aia-field" style="flex: 2;">
                                            <label class="aia-label" for="aia-free-name">Nome *</label>
                                            <input
                                                id="aia-free-name"
                                                v-model="freeForm.name"
                                                type="text"
                                                class="aia-input"
                                                placeholder="Es. Acqua naturale"
                                                :aria-invalid="!!freeErrors.name"
                                            />
                                            <p v-if="freeErrors.name" class="aia-err">{{ freeErrors.name }}</p>
                                        </div>
                                        <div class="aia-field" style="flex: 1;">
                                            <label class="aia-label" for="aia-free-price">Prezzo *</label>
                                            <div class="aia-input-suffix-wrap">
                                                <input
                                                    id="aia-free-price"
                                                    v-model="freeForm.price"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    class="aia-input"
                                                    placeholder="0.00"
                                                    :aria-invalid="!!freeErrors.price"
                                                />
                                                <span class="aia-input-suffix">€</span>
                                            </div>
                                            <p v-if="freeErrors.price" class="aia-err">{{ freeErrors.price }}</p>
                                        </div>
                                    </div>
                                    <div class="aia-field">
                                        <label class="aia-label" for="aia-free-category">Categoria</label>
                                        <input
                                            id="aia-free-category"
                                            v-model="freeForm.category"
                                            type="text"
                                            class="aia-input"
                                            placeholder="Es. Bevande"
                                            :aria-invalid="!!freeErrors.category"
                                        />
                                        <p v-if="freeErrors.category" class="aia-err">{{ freeErrors.category }}</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- 3 · Quantità + Note -->
                        <section
                            v-if="tab === 'free' || (tab === 'menu' && selectedElement)"
                            class="aia-section"
                        >
                            <aside class="aia-section-head">
                                <div class="aia-section-num-row">
                                    <span class="aia-section-num">3</span>
                                    <h2 class="aia-section-title">Dettagli</h2>
                                </div>
                                <p class="aia-section-sub">{{ sectionDetailsTitle }}</p>
                            </aside>
                            <div class="aia-section-body">
                                <div class="aia-row-2">
                                    <div class="aia-field" style="flex: 1;">
                                        <label class="aia-label" :for="tab === 'menu' ? 'aia-menu-qty' : 'aia-free-qty'">
                                            Quantità *
                                        </label>
                                        <input
                                            v-if="tab === 'menu'"
                                            id="aia-menu-qty"
                                            v-model.number="menuQty"
                                            type="number"
                                            min="1"
                                            class="aia-input"
                                        />
                                        <input
                                            v-else
                                            id="aia-free-qty"
                                            v-model.number="freeForm.quantity"
                                            type="number"
                                            min="1"
                                            class="aia-input"
                                            :aria-invalid="!!freeErrors.quantity"
                                        />
                                        <p v-if="tab === 'free' && freeErrors.quantity" class="aia-err">{{ freeErrors.quantity }}</p>
                                    </div>
                                    <div class="aia-field" style="flex: 2;">
                                        <label class="aia-label" :for="tab === 'menu' ? 'aia-menu-notes' : 'aia-free-notes'">
                                            Note
                                        </label>
                                        <input
                                            v-if="tab === 'menu'"
                                            id="aia-menu-notes"
                                            v-model="menuNotes"
                                            type="text"
                                            class="aia-input"
                                            placeholder="Es. senza cipolla"
                                        />
                                        <input
                                            v-else
                                            id="aia-free-notes"
                                            v-model="freeForm.notes"
                                            type="text"
                                            class="aia-input"
                                            placeholder="Opzionale"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <!-- Sticky bottom action bar -->
                    <footer class="aia-foot">
                        <div class="aia-foot-left">
                            <span class="aia-foot-tag">
                                <i class="bi bi-layers" aria-hidden="true"></i>
                                {{ courseLabel(selectedCourse) }}
                            </span>
                        </div>
                        <button type="button" class="aia-btn aia-btn--ghost" @click="onClose">
                            Annulla
                        </button>
                        <button
                            type="button"
                            class="aia-btn aia-btn--primary"
                            :disabled="!canSubmit"
                            @click="onPrimarySubmit"
                        >
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                            <span>{{ submitLabel }}</span>
                        </button>
                    </footer>
                </div>
            </div>
        </Transition>
    </TeleportCompat>
</template>

<style scoped>
/* ─────────────── Overlay full-screen modal ─────────────── */
.aia-overlay {
    position: fixed;
    inset: 0;
    z-index: 8500;
    background: color-mix(in oklab, black 55%, transparent);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: stretch;
    justify-content: center;
    padding: 24px;
}
.aia-shell {
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 14px;
    width: 100%;
    max-width: 1080px;
    max-height: calc(100vh - 48px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-pop, 0 24px 64px rgba(0, 0, 0, 0.3));
    font-family: var(--f-sans);
}

.aia-fade-enter-active, .aia-fade-leave-active { transition: opacity 200ms ease; }
.aia-fade-enter-active .aia-shell, .aia-fade-leave-active .aia-shell {
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.aia-fade-enter-from, .aia-fade-leave-to { opacity: 0; }
.aia-fade-enter-from .aia-shell, .aia-fade-leave-to .aia-shell { transform: translateY(16px); }

/* ─────────────── Header ─────────────── */
.aia-head {
    flex-shrink: 0;
    padding: 18px 28px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
}
.aia-crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 10px;
}
.aia-crumb { color: var(--ink-3); }
.aia-crumb--current { color: var(--ink); font-weight: 600; }
.aia-crumb-sep { color: var(--ink-3); opacity: 0.6; }

.aia-title-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
}
.aia-title-block { flex: 1; min-width: 0; }
.aia-title {
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--ink);
}
.aia-subtitle {
    margin: 4px 0 0;
    font-size: 13.5px;
    color: var(--ink-3);
    line-height: 1.45;
}
.aia-close {
    appearance: none;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    width: 36px; height: 36px;
    display: grid; place-items: center;
    cursor: pointer;
    color: var(--ink-2);
    transition: background var(--dur-fast), color var(--dur-fast);
    flex-shrink: 0;
}
.aia-close:hover { background: var(--bg-hover); color: var(--ink); }
.aia-close i { font-size: 14px; }

/* ─────────────── Body + Sezioni numerate ─────────────── */
.aia-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.aia-section {
    display: flex;
    gap: 24px;
    padding: 22px 28px;
    border-bottom: 1px solid var(--line);
}
.aia-section:last-child { border-bottom: none; }
.aia-section-head {
    width: 220px;
    flex-shrink: 0;
    padding-top: 4px;
}
.aia-section-num-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.aia-section-num {
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
.aia-section-title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 650;
    color: var(--ink);
}
.aia-section-sub {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.45;
}
.aia-section-body { flex: 1; min-width: 0; }

/* ─────────────── Field primitives ─────────────── */
.aia-row-2 { display: flex; gap: 14px; margin-bottom: 14px; }
.aia-row-2:last-child { margin-bottom: 0; }
.aia-field { display: flex; flex-direction: column; }
.aia-label {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-2);
    margin-bottom: 6px;
}
.aia-input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.aia-input:focus {
    border-color: var(--ac);
    box-shadow: 0 0 0 3px var(--ac-soft);
}
.aia-input--search { padding-left: 36px; height: 38px; }
.aia-input-suffix-wrap { position: relative; }
.aia-input-suffix-wrap .aia-input { padding-right: 36px; }
.aia-input-suffix {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-size: 14px;
    pointer-events: none;
}

.aia-err {
    color: var(--danger);
    font-family: var(--f-mono);
    font-size: 12px;
    margin: 4px 0 0;
}

/* ─────────────── Chip / Tab / Course ─────────────── */
.aia-course-options,
.aia-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.aia-chip-row { margin-bottom: 12px; }
.aia-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--ink-2);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.aia-chip:hover:not(:disabled) { background: var(--bg-hover); }
.aia-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.aia-chip--active {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
}
.aia-chip--icon { width: 36px; padding: 0; justify-content: center; }
.aia-chip-count {
    font-family: var(--f-mono);
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
}

.aia-tabs {
    display: inline-flex;
    align-items: stretch;
    gap: 2px;
    padding: 4px;
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
    margin-bottom: 14px;
}
.aia-tab {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: transparent;
    border: none;
    border-radius: 7px;
    color: var(--ink-3);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.aia-tab:hover { color: var(--ink); }
.aia-tab--active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 600;
    box-shadow: var(--shadow-xs);
}

.aia-link-btn {
    background: none;
    border: none;
    padding: 6px 0 0;
    color: var(--ac);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
}
.aia-link-btn:hover { color: var(--ac-ink); }

/* ─────────────── Search ─────────────── */
.aia-search {
    position: relative;
    margin-bottom: 12px;
}
.aia-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-size: 14px;
    pointer-events: none;
}

/* ─────────────── Loading / Banners / Empty ─────────────── */
.aia-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 28px 16px;
    color: var(--ink-3);
    font-size: 14px;
}
.aia-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 13px;
}
.aia-banner--error {
    background: color-mix(in oklab, var(--danger) 10%, var(--paper));
    color: var(--danger);
    border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
}
.aia-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
}

/* ─────────────── Lista piatti ─────────────── */
.aia-list {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
}
.aia-list-cat {
    font-family: var(--f-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 10px 14px 6px;
    background: var(--bg-sunk);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 1;
}
.aia-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    width: 100%;
    transition: background var(--dur-fast);
}
.aia-list-item:last-child { border-bottom: none; }
.aia-list-item:hover { background: var(--bg-hover); }
.aia-list-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
}
.aia-list-price {
    font-family: var(--f-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--ac-ink, var(--ac));
    flex-shrink: 0;
}

/* ─────────────── Selected card ─────────────── */
.aia-selected {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.aia-selected-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
}
.aia-selected-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.aia-selected-name { font-size: 15px; font-weight: 650; color: var(--ink); }
.aia-selected-cat {
    font-family: var(--f-mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
}
.aia-selected-price {
    font-family: var(--f-mono);
    font-size: 18px;
    font-weight: 700;
    color: var(--ac-ink, var(--ac));
    flex-shrink: 0;
}

/* ─────────────── Sticky bottom bar ─────────────── */
.aia-foot {
    flex-shrink: 0;
    height: 64px;
    border-top: 1px solid var(--line);
    background: var(--paper);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 28px;
}
.aia-foot-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.aia-foot-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--f-mono);
    font-size: 12px;
    color: var(--ink-2);
    padding: 4px 10px;
    background: var(--bg-sunk);
    border-radius: 999px;
}
.aia-foot-tag i { color: var(--ac); font-size: 13px; }

/* ─────────────── Buttons ─────────────── */
.aia-btn {
    appearance: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    height: 40px;
    padding: 0 16px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--paper);
    color: var(--ink);
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.aia-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.aia-btn--ghost { background: var(--paper); color: var(--ink-2); }
.aia-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.aia-btn--primary {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
}
.aia-btn--primary:hover:not(:disabled) {
    background: var(--ac);
    border-color: var(--ac);
}
.aia-btn i { font-size: 14px; }

/* ─────────────── Responsive ─────────────── */
@media (max-width: 980px) {
    .aia-section { flex-direction: column; gap: 12px; }
    .aia-section-head { width: 100%; padding-top: 0; }
}
@media (max-width: 640px) {
    .aia-overlay { padding: 0; }
    .aia-shell { max-height: 100vh; border-radius: 0; max-width: 100%; }
    .aia-head { padding: 14px 16px; }
    .aia-section { padding: 18px 16px; }
    .aia-row-2 { flex-direction: column; gap: 12px; }
    .aia-foot { padding: 0 16px; }
    .aia-foot-left { display: none; }
}
</style>

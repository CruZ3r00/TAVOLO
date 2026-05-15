<script setup>
// DishPickerOverlay: overlay full-screen modale per scegliere UN piatto da
// aggiungere a un ordine. Tab "Da menu" (search + filtri categoria + lista
// raggruppata) o "Libero" (form name/price/category). Emette `pick(payload)`
// con il payload pronto da consegnare a addOrderItem (eccetto course e
// lock_version che li aggiunge il chiamante).
//
// Props: show, defaultCategory (opt), defaultQty (opt).
// Emits: close, pick(payload).
//
// Pattern visivo allineato a MenuAdder/BeverageAdvancedEditor (sezioni
// numerate). Il chiamante decide la portata e il lock_version.

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import TeleportCompat from '@/lib/compat/teleport.js';
import { fetchMenuElements } from '@/utils';
import { useStore } from 'vuex';
import { effectiveUserDocumentId } from '@/staffAccess';

const props = defineProps({
    show: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'pick']);

const store = useStore();

const tab = ref('menu');
const menuElements = ref([]);
const menuLoading = ref(false);
const menuError = ref('');
const searchQuery = ref('');
const selectedCategory = ref('all');

const freeForm = ref({ name: '', price: '', quantity: 1, category: 'Altro', notes: '' });
const freeErrors = ref({});

const selectedElement = ref(null);
const menuQty = ref(1);
const menuNotes = ref('');

let savedOverflow = '';

const resetState = () => {
    tab.value = 'menu';
    selectedElement.value = null;
    menuQty.value = 1;
    menuNotes.value = '';
    freeForm.value = { name: '', price: '', quantity: 1, category: 'Altro', notes: '' };
    freeErrors.value = {};
    searchQuery.value = '';
    selectedCategory.value = 'all';
    menuError.value = '';
};

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
    resetState();
    await loadMenu();
});

const onKeydown = (e) => {
    if (!props.show) return;
    if (e.key === 'Escape') { e.preventDefault(); emit('close'); }
};
if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown);
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
    return menuElements.value.filter((el) => {
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

const selectElement = (el) => {
    selectedElement.value = el;
    menuQty.value = 1;
    menuNotes.value = '';
};
const clearSelectedElement = () => { selectedElement.value = null; };

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

const canPick = computed(() => {
    if (tab.value === 'menu') return !!selectedElement.value && menuQty.value >= 1;
    return true;
});

const onPick = () => {
    if (tab.value === 'menu') {
        if (!selectedElement.value) return;
        emit('pick', {
            element_id: selectedElement.value.documentId,
            element_name: selectedElement.value.name,
            element_category: selectedElement.value.category,
            element_price: selectedElement.value.price,
            quantity: menuQty.value,
            notes: menuNotes.value.trim() || undefined,
        });
        return;
    }
    if (!validateFree()) return;
    emit('pick', {
        name: freeForm.value.name.trim(),
        price: parseFloat(freeForm.value.price),
        quantity: parseInt(freeForm.value.quantity, 10),
        category: freeForm.value.category.trim() || 'Altro',
        notes: freeForm.value.notes.trim() || undefined,
    });
};

const onClose = () => emit('close');
</script>

<template>
    <TeleportCompat to="body">
        <Transition name="dpo-fade">
            <div
                v-if="show"
                class="dpo-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="Scegli piatto"
                @click.self="onClose"
            >
                <div class="dpo-shell">
                    <header class="dpo-head">
                        <div class="dpo-head-block">
                            <h2 class="dpo-title">Scegli un piatto</h2>
                            <p class="dpo-subtitle">Aggiungilo alla portata corrente del tavolo.</p>
                        </div>
                        <button type="button" class="dpo-close" aria-label="Chiudi" @click="onClose">
                            <i class="bi bi-x-lg" aria-hidden="true"></i>
                        </button>
                    </header>

                    <div class="dpo-body">
                        <!-- Tabs Menu / Libero -->
                        <div class="dpo-tabs" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                :aria-selected="tab === 'menu'"
                                class="dpo-tab"
                                :class="{ 'dpo-tab--active': tab === 'menu' }"
                                @click="tab = 'menu'; clearSelectedElement()"
                            >
                                <i class="bi bi-journal-text" aria-hidden="true"></i>
                                <span>Da menu</span>
                            </button>
                            <button
                                type="button"
                                role="tab"
                                :aria-selected="tab === 'free'"
                                class="dpo-tab"
                                :class="{ 'dpo-tab--active': tab === 'free' }"
                                @click="tab = 'free'"
                            >
                                <i class="bi bi-pencil-square" aria-hidden="true"></i>
                                <span>Libero</span>
                            </button>
                        </div>

                        <!-- Da menu -->
                        <div v-if="tab === 'menu'" class="dpo-menu-panel">
                            <div v-if="menuLoading" class="dpo-loading">
                                <span class="ds-spinner" aria-hidden="true"></span>
                                <span>Caricamento menu…</span>
                            </div>
                            <div v-else-if="menuError" class="dpo-banner dpo-banner--error">
                                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                                <span>{{ menuError }}</span>
                            </div>
                            <template v-else>
                                <div v-if="!selectedElement">
                                    <div class="dpo-search">
                                        <i class="bi bi-search dpo-search-icon" aria-hidden="true"></i>
                                        <input
                                            v-model="searchQuery"
                                            type="text"
                                            class="dpo-input dpo-input--search"
                                            placeholder="Cerca piatto o categoria…"
                                        />
                                    </div>
                                    <div v-if="categoryCounts.length" class="dpo-chip-row">
                                        <button
                                            type="button"
                                            class="dpo-chip"
                                            :class="{ 'dpo-chip--active': selectedCategory === 'all' }"
                                            @click="selectedCategory = 'all'"
                                        >
                                            Tutto
                                            <span class="dpo-chip-count">{{ menuElements.length }}</span>
                                        </button>
                                        <button
                                            v-for="cat in categoryCounts"
                                            :key="cat.name"
                                            type="button"
                                            class="dpo-chip"
                                            :class="{ 'dpo-chip--active': selectedCategory === cat.name }"
                                            @click="selectedCategory = cat.name"
                                        >
                                            {{ cat.name }}
                                            <span class="dpo-chip-count">{{ cat.count }}</span>
                                        </button>
                                    </div>
                                    <div class="dpo-list">
                                        <div v-if="filteredElements.length === 0" class="dpo-empty">Nessun piatto trovato.</div>
                                        <template v-for="(items, category) in groupedByCategory" :key="category">
                                            <div class="dpo-list-cat">{{ category }}</div>
                                            <button
                                                v-for="el in items"
                                                :key="el.documentId"
                                                type="button"
                                                class="dpo-list-item"
                                                @click="selectElement(el)"
                                            >
                                                <span class="dpo-list-name">{{ el.name }}</span>
                                                <span class="dpo-list-price">€ {{ parseFloat(el.price).toFixed(2) }}</span>
                                            </button>
                                        </template>
                                    </div>
                                </div>
                                <div v-else class="dpo-selected">
                                    <div class="dpo-selected-card">
                                        <div class="dpo-selected-info">
                                            <span class="dpo-selected-name">{{ selectedElement.name }}</span>
                                            <span class="dpo-selected-cat">{{ selectedElement.category || 'Altro' }}</span>
                                        </div>
                                        <span class="dpo-selected-price">€ {{ parseFloat(selectedElement.price).toFixed(2) }}</span>
                                    </div>
                                    <button type="button" class="dpo-link-btn" @click="clearSelectedElement">
                                        ← Cambia piatto
                                    </button>
                                    <div class="dpo-row-2">
                                        <div class="dpo-field" style="flex: 1;">
                                            <label class="dpo-label" for="dpo-menu-qty">Quantità *</label>
                                            <input
                                                id="dpo-menu-qty"
                                                v-model.number="menuQty"
                                                type="number"
                                                min="1"
                                                class="dpo-input"
                                            />
                                        </div>
                                        <div class="dpo-field" style="flex: 2;">
                                            <label class="dpo-label" for="dpo-menu-notes">Note</label>
                                            <input
                                                id="dpo-menu-notes"
                                                v-model="menuNotes"
                                                type="text"
                                                class="dpo-input"
                                                placeholder="Es. senza cipolla"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <!-- Libero -->
                        <div v-else class="dpo-free-panel">
                            <div class="dpo-row-2">
                                <div class="dpo-field" style="flex: 2;">
                                    <label class="dpo-label" for="dpo-free-name">Nome *</label>
                                    <input
                                        id="dpo-free-name"
                                        v-model="freeForm.name"
                                        type="text"
                                        class="dpo-input"
                                        placeholder="Es. Acqua naturale"
                                        :aria-invalid="!!freeErrors.name"
                                    />
                                    <p v-if="freeErrors.name" class="dpo-err">{{ freeErrors.name }}</p>
                                </div>
                                <div class="dpo-field" style="flex: 1;">
                                    <label class="dpo-label" for="dpo-free-price">Prezzo *</label>
                                    <div class="dpo-input-suffix-wrap">
                                        <input
                                            id="dpo-free-price"
                                            v-model="freeForm.price"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            class="dpo-input"
                                            placeholder="0.00"
                                            :aria-invalid="!!freeErrors.price"
                                        />
                                        <span class="dpo-input-suffix">€</span>
                                    </div>
                                    <p v-if="freeErrors.price" class="dpo-err">{{ freeErrors.price }}</p>
                                </div>
                            </div>
                            <div class="dpo-row-2">
                                <div class="dpo-field" style="flex: 1;">
                                    <label class="dpo-label" for="dpo-free-qty">Quantità *</label>
                                    <input
                                        id="dpo-free-qty"
                                        v-model.number="freeForm.quantity"
                                        type="number"
                                        min="1"
                                        class="dpo-input"
                                        :aria-invalid="!!freeErrors.quantity"
                                    />
                                    <p v-if="freeErrors.quantity" class="dpo-err">{{ freeErrors.quantity }}</p>
                                </div>
                                <div class="dpo-field" style="flex: 2;">
                                    <label class="dpo-label" for="dpo-free-cat">Categoria</label>
                                    <input
                                        id="dpo-free-cat"
                                        v-model="freeForm.category"
                                        type="text"
                                        class="dpo-input"
                                        placeholder="Es. Bevande"
                                    />
                                </div>
                            </div>
                            <div class="dpo-field">
                                <label class="dpo-label" for="dpo-free-notes">Note</label>
                                <input
                                    id="dpo-free-notes"
                                    v-model="freeForm.notes"
                                    type="text"
                                    class="dpo-input"
                                    placeholder="Opzionale"
                                />
                            </div>
                        </div>
                    </div>

                    <footer class="dpo-foot">
                        <button type="button" class="dpo-btn dpo-btn--ghost" @click="onClose">Annulla</button>
                        <button type="button" class="dpo-btn dpo-btn--primary" :disabled="!canPick" @click="onPick">
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                            <span>Aggiungi alla coda</span>
                        </button>
                    </footer>
                </div>
            </div>
        </Transition>
    </TeleportCompat>
</template>

<style scoped>
.dpo-overlay {
    position: fixed; inset: 0; z-index: 8500;
    background: color-mix(in oklab, black 55%, transparent);
    backdrop-filter: blur(6px);
    display: flex; align-items: stretch; justify-content: center;
    padding: 24px;
}
.dpo-shell {
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--line); border-radius: 14px;
    width: 100%; max-width: 720px;
    max-height: calc(100vh - 48px);
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: var(--shadow-pop, 0 24px 64px rgba(0, 0, 0, 0.3));
    font-family: var(--f-sans);
}

.dpo-fade-enter-active, .dpo-fade-leave-active { transition: opacity 200ms ease; }
.dpo-fade-enter-active .dpo-shell, .dpo-fade-leave-active .dpo-shell {
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dpo-fade-enter-from, .dpo-fade-leave-to { opacity: 0; }
.dpo-fade-enter-from .dpo-shell, .dpo-fade-leave-to .dpo-shell { transform: translateY(16px); }

.dpo-head {
    flex-shrink: 0; padding: 18px 24px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    display: flex; align-items: flex-start; gap: 14px;
}
.dpo-head-block { flex: 1; min-width: 0; }
.dpo-title { margin: 0; font-size: 18px; font-weight: 650; color: var(--ink); }
.dpo-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--ink-3); }
.dpo-close {
    appearance: none; background: transparent;
    border: 1px solid var(--line); border-radius: 8px;
    width: 34px; height: 34px;
    display: grid; place-items: center;
    cursor: pointer; color: var(--ink-2);
}
.dpo-close:hover { background: var(--bg-hover); color: var(--ink); }

.dpo-body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 24px; }

.dpo-tabs {
    display: inline-flex; gap: 2px; padding: 4px;
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
    margin-bottom: 14px;
}
.dpo-tab {
    appearance: none; display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    background: transparent; border: none; border-radius: 7px;
    color: var(--ink-3); font-family: inherit;
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.dpo-tab:hover { color: var(--ink); }
.dpo-tab--active { background: var(--paper); color: var(--ink); font-weight: 600; box-shadow: var(--shadow-xs); }

.dpo-search { position: relative; margin-bottom: 12px; }
.dpo-search-icon {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    color: var(--ink-3); font-size: 14px; pointer-events: none;
}
.dpo-input {
    width: 100%; height: 38px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); color: var(--ink);
    font-family: inherit; font-size: 14px; outline: none;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.dpo-input:focus { border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }
.dpo-input--search { padding-left: 36px; }
.dpo-input-suffix-wrap { position: relative; }
.dpo-input-suffix-wrap .dpo-input { padding-right: 32px; }
.dpo-input-suffix { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-3); font-size: 14px; pointer-events: none; }

.dpo-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.dpo-chip {
    display: inline-flex; align-items: center; gap: 7px;
    height: 32px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 999px;
    background: var(--bg); color: var(--ink-2);
    font-family: inherit; font-size: 12.5px; font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.dpo-chip:hover { background: var(--bg-hover); }
.dpo-chip--active { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.dpo-chip-count { font-family: var(--f-mono); font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }

.dpo-list {
    border: 1px solid var(--line); border-radius: 10px;
    background: var(--paper);
    max-height: 420px; overflow-y: auto;
}
.dpo-list-cat {
    font-family: var(--f-mono); font-size: 10px; font-weight: 600;
    color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.12em;
    padding: 10px 14px 6px;
    background: var(--bg-sunk); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 1;
}
.dpo-list-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: transparent; border: none; border-bottom: 1px solid var(--line);
    cursor: pointer; font-family: inherit; text-align: left; width: 100%;
    transition: background var(--dur-fast);
}
.dpo-list-item:last-child { border-bottom: none; }
.dpo-list-item:hover { background: var(--bg-hover); }
.dpo-list-name { font-size: 14px; font-weight: 500; color: var(--ink); }
.dpo-list-price { font-family: var(--f-mono); font-size: 13px; font-weight: 700; color: var(--ac-ink, var(--ac)); flex-shrink: 0; }

.dpo-empty { padding: 24px 16px; text-align: center; color: var(--ink-3); font-size: 13px; }
.dpo-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 28px 16px; color: var(--ink-3); font-size: 14px; }
.dpo-banner { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 13px; }
.dpo-banner--error { background: color-mix(in oklab, var(--danger) 10%, var(--paper)); color: var(--danger); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent); }

.dpo-selected { display: flex; flex-direction: column; gap: 10px; }
.dpo-selected-card {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: 14px 16px;
    background: var(--bg-sunk); border: 1px solid var(--line); border-radius: 10px;
}
.dpo-selected-info { display: flex; flex-direction: column; gap: 4px; }
.dpo-selected-name { font-size: 15px; font-weight: 650; color: var(--ink); }
.dpo-selected-cat { font-family: var(--f-mono); font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; }
.dpo-selected-price { font-family: var(--f-mono); font-size: 18px; font-weight: 700; color: var(--ac-ink, var(--ac)); }
.dpo-link-btn {
    align-self: flex-start;
    background: none; border: none; padding: 0;
    color: var(--ac); font-family: inherit;
    font-size: 13px; font-weight: 500; cursor: pointer;
}
.dpo-link-btn:hover { color: var(--ac-ink); }

.dpo-row-2 { display: flex; gap: 12px; margin-bottom: 12px; }
.dpo-row-2:last-child { margin-bottom: 0; }
.dpo-field { display: flex; flex-direction: column; }
.dpo-label { font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin-bottom: 6px; }
.dpo-err { color: var(--danger); font-family: var(--f-mono); font-size: 12px; margin: 4px 0 0; }

.dpo-foot {
    flex-shrink: 0; height: 64px;
    border-top: 1px solid var(--line); background: var(--paper);
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 0 24px;
}
.dpo-btn {
    appearance: none; border: 1px solid var(--line); border-radius: 8px;
    height: 40px; padding: 0 16px;
    font-family: inherit; font-size: 14px; font-weight: 500;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--paper); color: var(--ink);
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.dpo-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.dpo-btn--ghost { color: var(--ink-2); }
.dpo-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.dpo-btn--primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.dpo-btn--primary:hover:not(:disabled) { background: var(--ac); border-color: var(--ac); }

@media (max-width: 640px) {
    .dpo-overlay { padding: 0; }
    .dpo-shell { max-height: 100vh; border-radius: 0; max-width: 100%; }
    .dpo-row-2 { flex-direction: column; gap: 12px; }
}
</style>

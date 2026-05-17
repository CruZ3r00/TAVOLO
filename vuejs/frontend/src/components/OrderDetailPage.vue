<script setup>
// OrderDetailPage: vista FULL-SCREEN del dettaglio tavolo (modalità cameriere).
// Sostituisce OrderDetailModal nella Sala. Si monta in linea al posto della
// grid quando salaView === 'order-detail'.
//
// Flusso UX richiesto dall'utente:
// - Apri il dettaglio tavolo full-screen
// - Vedi gli items dell'ordine raggruppati per portata
// - Switcha tra portate: gli items già aggiunti restano visibili
// - Aggiungi piatti CUMULATIVAMENTE (vengono creati subito come status='taken'
//   sul backend, così sono persistiti ma NON ancora in cucina)
// - Modifica/rimuovi gli items 'taken' inline
// - Bottone "Invia in cucina (N)" conferma: avanza tutti i 'taken' a
//   'preparing' in batch (POST /api/orders/:id/send) e torna alla vista grid
//
// Items già in cucina (preparing/ready/served) sono visibili come read-only
// con badge stato.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
    fetchOrder, addOrderItem, updateOrderItem, deleteOrderItem,
    updateItemStatus, sendOrderToProduction, orderErrorMessage,
} from '@/utils';
import DishPickerOverlay from '@/components/DishPickerOverlay.vue';

const props = defineProps({
    orderDocumentId: { type: String, default: null },
    token: { type: String, default: null },
});
const emit = defineEmits(['back', 'sent', 'order-updated']);

const order = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const sendingToCucina = ref(false);
const pickerOpen = ref(false);
const selectedCourse = ref(1);
const busyItemIds = ref(new Set());
const editingItemId = ref(null);
const editingPatch = ref({});

const items = computed(() => order.value?.items || order.value?.fk_items || []);
const lockVersion = computed(() => Number(order.value?.lock_version) || 0);
const isActive = computed(() => order.value?.status === 'active');

// "Da inviare" = item ancora nelle mani del cameriere (pending). Dopo
// "Invia in cucina" passano a taken e diventano visibili in KitchenBoard.
const itemsTakenCount = computed(() => items.value.filter((it) => it.status === 'pending').length);

// Calcola le portate disponibili: union(courses esistenti) + 1..4 minimo +
// portata correntemente selezionata. Permetto sempre di andare oltre con +.
const courses = computed(() => {
    const set = new Set();
    for (const it of items.value) {
        const c = Number(it.course) || 1;
        set.add(c);
    }
    set.add(selectedCourse.value);
    // Garantisco almeno 1..4 visibili
    for (let i = 1; i <= 4; i += 1) set.add(i);
    return Array.from(set).sort((a, b) => a - b);
});
const maxCourse = computed(() => courses.value[courses.value.length - 1] || 1);

const itemsForCurrentCourse = computed(() => items.value.filter((it) => (Number(it.course) || 1) === selectedCourse.value));
const takenItemsForCurrentCourse = computed(() => itemsForCurrentCourse.value.filter((it) => it.status === 'pending'));
const sentItemsForCurrentCourse = computed(() => itemsForCurrentCourse.value.filter((it) => it.status !== 'pending'));

const takenCountByCourse = (course) => items.value.filter((it) => (Number(it.course) || 1) === course && it.status === 'pending').length;
const totalCountByCourse = (course) => items.value.filter((it) => (Number(it.course) || 1) === course).length;

const orderTotal = computed(() => {
    const t = parseFloat(order.value?.total_amount);
    if (Number.isFinite(t) && t > 0) return t;
    return items.value.reduce((s, it) => s + (parseFloat(it.price) * parseInt(it.quantity, 10) || 0), 0);
});

const tableLabel = computed(() => {
    const t = order.value?.table;
    if (!t) return 'Ordine';
    return t.number ? `Tavolo ${t.number}` : 'Tavolo';
});
const minutesOpen = computed(() => {
    if (!order.value?.opened_at) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(order.value.opened_at).getTime()) / 60000));
});
const fmt = (v) => `€ ${(Number(v) || 0).toFixed(2)}`;

const statusLabel = (s) => {
    switch (s) {
        case 'pending': return 'Da inviare';
        case 'taken': return 'Da fare';
        case 'preparing': return 'In preparazione';
        case 'ready': return 'Pronto';
        case 'served': return 'Servito';
        default: return s || '—';
    }
};

const load = async () => {
    if (!props.orderDocumentId || !props.token) return;
    loading.value = true;
    errorMessage.value = '';
    try {
        const fresh = await fetchOrder(props.orderDocumentId, props.token);
        order.value = fresh;
        // Imposta selectedCourse al massimo già presente, default 1.
        const courseSet = new Set();
        for (const it of (fresh?.items || fresh?.fk_items || [])) {
            const c = Number(it.course) || 1;
            courseSet.add(c);
        }
        const max = Math.max(1, ...Array.from(courseSet));
        if (!selectedCourse.value || selectedCourse.value > max) selectedCourse.value = 1;
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
    } finally {
        loading.value = false;
    }
};

watch(() => props.orderDocumentId, async () => { await load(); }, { immediate: false });

const openPicker = () => { pickerOpen.value = true; };
const closePicker = () => { pickerOpen.value = false; };

const onPickDish = async (picked) => {
    closePicker();
    if (!order.value) return;
    const payload = picked.element_id
        ? {
            element_id: picked.element_id,
            quantity: picked.quantity,
            course: selectedCourse.value,
            notes: picked.notes,
            lock_version: lockVersion.value,
        }
        : {
            name: picked.name,
            price: picked.price,
            quantity: picked.quantity,
            category: picked.category,
            course: selectedCourse.value,
            notes: picked.notes,
            lock_version: lockVersion.value,
        };
    try {
        await addOrderItem(order.value.documentId, payload, props.token);
        await load();
        emit('order-updated');
    } catch (err) {
        if (err?.code === 'STALE_ORDER') {
            await load();
            errorMessage.value = 'Dati obsoleti, ho aggiornato la lista. Riprova.';
        } else {
            errorMessage.value = orderErrorMessage(err);
        }
    }
};

const incrementCourse = () => {
    const next = Math.min(12, maxCourse.value + 1);
    selectedCourse.value = next;
};

// Inline edit quantità
const startEdit = (item) => {
    editingItemId.value = item.documentId;
    editingPatch.value = { quantity: item.quantity, notes: item.notes || '' };
};
const cancelEdit = () => {
    editingItemId.value = null;
    editingPatch.value = {};
};
const commitEdit = async (item) => {
    const newQty = parseInt(editingPatch.value.quantity, 10);
    const newNotes = String(editingPatch.value.notes || '').trim();
    const patch = {};
    if (Number.isFinite(newQty) && newQty >= 1 && newQty !== item.quantity) patch.quantity = newQty;
    if (newNotes !== (item.notes || '')) patch.notes = newNotes || null;
    if (Object.keys(patch).length === 0) {
        cancelEdit();
        return;
    }
    patch.lock_version = lockVersion.value;
    busyItemIds.value = new Set([...busyItemIds.value, item.documentId]);
    try {
        await updateOrderItem(order.value.documentId, item.documentId, patch, props.token);
        await load();
        emit('order-updated');
    } catch (err) {
        if (err?.code === 'STALE_ORDER') {
            await load();
            errorMessage.value = 'Dati obsoleti, ho aggiornato la lista. Riprova.';
        } else {
            errorMessage.value = orderErrorMessage(err);
        }
    } finally {
        const next = new Set(busyItemIds.value);
        next.delete(item.documentId);
        busyItemIds.value = next;
        cancelEdit();
    }
};

const markServed = async (item) => {
    if (!order.value || item.status !== 'ready') return;
    if (busyItemIds.value.has(item.documentId)) return;
    busyItemIds.value = new Set([...busyItemIds.value, item.documentId]);
    const previousStatus = item.status;
    item.status = 'served';
    try {
        await updateItemStatus(order.value.documentId, item.documentId, 'served', props.token);
        emit('order-updated');
    } catch (err) {
        item.status = previousStatus;
        errorMessage.value = orderErrorMessage(err);
    } finally {
        const next = new Set(busyItemIds.value);
        next.delete(item.documentId);
        busyItemIds.value = next;
    }
};

const removeItem = async (item) => {
    if (!confirm(`Rimuovere "${item.name}" dall'ordine?`)) return;
    busyItemIds.value = new Set([...busyItemIds.value, item.documentId]);
    try {
        await deleteOrderItem(order.value.documentId, item.documentId, { lock_version: lockVersion.value }, props.token);
        await load();
        emit('order-updated');
    } catch (err) {
        if (err?.code === 'STALE_ORDER') {
            await load();
            errorMessage.value = 'Dati obsoleti, ho aggiornato la lista. Riprova.';
        } else {
            errorMessage.value = orderErrorMessage(err);
        }
    } finally {
        const next = new Set(busyItemIds.value);
        next.delete(item.documentId);
        busyItemIds.value = next;
    }
};

const confirmAndSend = async () => {
    if (!order.value || !isActive.value || sendingToCucina.value) return;
    if (itemsTakenCount.value === 0) return;
    sendingToCucina.value = true;
    errorMessage.value = '';
    try {
        const resp = await sendOrderToProduction(order.value.documentId, props.token);
        const sent = resp?.meta?.sent ?? 0;
        emit('sent', { sent, order: resp?.data });
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
    } finally {
        sendingToCucina.value = false;
    }
};

const onBack = () => emit('back');

const onKeydown = (e) => {
    if (pickerOpen.value) return; // l'overlay gestisce Esc autonomamente
    if (e.key === 'Escape') { e.preventDefault(); onBack(); }
};

onMounted(async () => {
    if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown);
    await load();
});
onBeforeUnmount(() => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
});

const courseLabel = (n) => `${n}ª portata`;
</script>

<template>
    <div class="odp-shell">
        <!-- Header full-screen -->
        <header class="odp-head">
            <button type="button" class="odp-back-btn" aria-label="Torna alla sala" @click="onBack">
                <i class="bi bi-arrow-left" aria-hidden="true"></i>
            </button>
            <div class="odp-head-block">
                <nav class="odp-crumbs" aria-label="breadcrumb">
                    <span class="odp-crumb">Sala</span>
                    <span class="odp-crumb-sep" aria-hidden="true">/</span>
                    <span class="odp-crumb odp-crumb--current">{{ tableLabel }}</span>
                </nav>
                <h1 class="odp-title">{{ tableLabel }}</h1>
                <div class="odp-meta">
                    <span v-if="order?.covers"><i class="bi bi-people"></i> {{ order.covers }} persone</span>
                    <span v-if="minutesOpen > 0"><i class="bi bi-clock"></i> {{ minutesOpen }} min al tavolo</span>
                    <span class="odp-meta-total">{{ fmt(orderTotal) }}</span>
                </div>
            </div>
        </header>

        <Transition name="odp-fade">
            <div v-if="errorMessage" class="odp-banner odp-banner--error" role="alert">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                <span>{{ errorMessage }}</span>
                <button type="button" class="odp-banner-close" aria-label="Chiudi" @click="errorMessage = ''">
                    <i class="bi bi-x" aria-hidden="true"></i>
                </button>
            </div>
        </Transition>

        <div v-if="loading && !order" class="odp-loading">
            <span class="ds-spinner" aria-hidden="true"></span>
            <span>Caricamento ordine…</span>
        </div>

        <template v-else-if="order">
            <!-- Selettore portata sticky -->
            <div class="odp-courses">
                <div class="odp-courses-label">Portate</div>
                <div class="odp-courses-row" role="tablist">
                    <button
                        v-for="c in courses"
                        :key="c"
                        type="button"
                        class="odp-course-chip"
                        :class="{ 'odp-course-chip--active': selectedCourse === c }"
                        :aria-selected="selectedCourse === c"
                        @click="selectedCourse = c"
                    >
                        <span>{{ courseLabel(c) }}</span>
                        <span v-if="totalCountByCourse(c) > 0" class="odp-course-count">
                            {{ totalCountByCourse(c) }}
                        </span>
                        <span
                            v-if="takenCountByCourse(c) > 0 && selectedCourse !== c"
                            class="odp-course-pulse"
                            :title="`${takenCountByCourse(c)} da inviare`"
                        ></span>
                    </button>
                    <button
                        type="button"
                        class="odp-course-chip odp-course-chip--icon"
                        :disabled="maxCourse >= 12"
                        aria-label="Aggiungi portata successiva"
                        @click="incrementCourse"
                    >
                        <i class="bi bi-plus-lg" aria-hidden="true"></i>
                    </button>
                </div>
            </div>

            <!-- Body: items per portata corrente -->
            <div class="odp-body">
                <!-- Da inviare (taken) -->
                <section class="odp-section">
                    <div class="odp-section-head">
                        <h2 class="odp-section-title">Da inviare</h2>
                        <span class="odp-section-meta">{{ takenItemsForCurrentCourse.length }}</span>
                    </div>

                    <div v-if="takenItemsForCurrentCourse.length === 0" class="odp-empty">
                        Nessun piatto in coda per questa portata. Aggiungine uno con il pulsante qui sotto.
                    </div>

                    <ul v-else class="odp-items">
                        <li v-for="item in takenItemsForCurrentCourse" :key="item.documentId" class="odp-item">
                            <div v-if="editingItemId !== item.documentId" class="odp-item-view">
                                <div class="odp-item-main">
                                    <div class="odp-item-name">{{ item.name }}</div>
                                    <div v-if="item.notes" class="odp-item-notes">
                                        <i class="bi bi-sticky" aria-hidden="true"></i> {{ item.notes }}
                                    </div>
                                </div>
                                <div class="odp-item-qty">
                                    <span class="odp-item-qty-x">×</span>
                                    <strong>{{ item.quantity }}</strong>
                                </div>
                                <div class="odp-item-price">{{ fmt(parseFloat(item.price) * parseInt(item.quantity, 10)) }}</div>
                                <div class="odp-item-actions">
                                    <button
                                        type="button"
                                        class="odp-icon-btn"
                                        title="Modifica"
                                        :disabled="busyItemIds.has(item.documentId)"
                                        @click="startEdit(item)"
                                    >
                                        <i class="bi bi-pencil" aria-hidden="true"></i>
                                    </button>
                                    <button
                                        type="button"
                                        class="odp-icon-btn odp-icon-btn--danger"
                                        title="Rimuovi"
                                        :disabled="busyItemIds.has(item.documentId)"
                                        @click="removeItem(item)"
                                    >
                                        <span v-if="busyItemIds.has(item.documentId)" class="odp-spin"><i class="bi bi-arrow-repeat"></i></span>
                                        <i v-else class="bi bi-trash" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                            <div v-else class="odp-item-edit">
                                <div class="odp-item-edit-name">{{ item.name }}</div>
                                <div class="odp-item-edit-fields">
                                    <label class="odp-edit-field">
                                        <span class="odp-edit-label">Quantità</span>
                                        <input
                                            v-model.number="editingPatch.quantity"
                                            type="number"
                                            min="1"
                                            class="odp-edit-input"
                                        />
                                    </label>
                                    <label class="odp-edit-field" style="flex: 2;">
                                        <span class="odp-edit-label">Note</span>
                                        <input
                                            v-model="editingPatch.notes"
                                            type="text"
                                            class="odp-edit-input"
                                            placeholder="Es. senza cipolla"
                                        />
                                    </label>
                                </div>
                                <div class="odp-item-edit-actions">
                                    <button type="button" class="odp-btn odp-btn--ghost" @click="cancelEdit">Annulla</button>
                                    <button
                                        type="button"
                                        class="odp-btn odp-btn--primary"
                                        :disabled="busyItemIds.has(item.documentId)"
                                        @click="commitEdit(item)"
                                    >
                                        <i class="bi bi-check2" aria-hidden="true"></i>
                                        <span>Salva</span>
                                    </button>
                                </div>
                            </div>
                        </li>
                    </ul>

                    <button type="button" class="odp-add-btn" @click="openPicker">
                        <i class="bi bi-plus-lg" aria-hidden="true"></i>
                        <span>Aggiungi piatto a {{ courseLabel(selectedCourse).toLowerCase() }}</span>
                    </button>
                </section>

                <!-- Già in cucina -->
                <section v-if="sentItemsForCurrentCourse.length > 0" class="odp-section">
                    <div class="odp-section-head">
                        <h2 class="odp-section-title">Già in cucina</h2>
                        <span class="odp-section-meta">{{ sentItemsForCurrentCourse.length }}</span>
                    </div>
                    <ul class="odp-items">
                        <li
                            v-for="item in sentItemsForCurrentCourse"
                            :key="item.documentId"
                            class="odp-item odp-item--locked"
                        >
                            <div class="odp-item-view">
                                <div class="odp-item-main">
                                    <div class="odp-item-name">{{ item.name }}</div>
                                    <div v-if="item.notes" class="odp-item-notes">
                                        <i class="bi bi-sticky" aria-hidden="true"></i> {{ item.notes }}
                                    </div>
                                </div>
                                <div class="odp-item-qty">
                                    <span class="odp-item-qty-x">×</span>
                                    <strong>{{ item.quantity }}</strong>
                                </div>
                                <div class="odp-item-price">{{ fmt(parseFloat(item.price) * parseInt(item.quantity, 10)) }}</div>
                                <span class="odp-status-badge" :class="`s-${item.status}`">
                                    {{ statusLabel(item.status) }}
                                </span>
                                <button
                                    v-if="item.status === 'ready'"
                                    type="button"
                                    class="odp-btn odp-btn--accent odp-btn--sm"
                                    :disabled="busyItemIds.has(item.documentId)"
                                    aria-label="Segna come servito"
                                    @click="markServed(item)"
                                >
                                    <i v-if="busyItemIds.has(item.documentId)" class="bi bi-arrow-repeat odp-spin" aria-hidden="true"></i>
                                    <i v-else class="bi bi-cup-straw" aria-hidden="true"></i>
                                    <span>Servito</span>
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>
            </div>
        </template>

        <!-- Sticky bottom action bar -->
        <footer class="odp-foot">
            <div class="odp-foot-left">
                <button type="button" class="odp-btn odp-btn--ghost" @click="onBack">
                    <i class="bi bi-arrow-left" aria-hidden="true"></i>
                    <span>Indietro</span>
                </button>
                <span v-if="itemsTakenCount > 0" class="odp-foot-hint">
                    Premi <strong>Invia in cucina</strong> per mandare la comanda ai reparti.
                </span>
                <span v-else class="odp-foot-hint">
                    Aggiungi i piatti del tavolo, poi invia tutto in cucina.
                </span>
            </div>
            <button
                type="button"
                class="odp-btn odp-btn--primary odp-btn--send"
                :disabled="!isActive || itemsTakenCount === 0 || sendingToCucina"
                @click="confirmAndSend"
            >
                <span v-if="sendingToCucina" class="odp-spin"><i class="bi bi-arrow-repeat"></i></span>
                <i v-else class="bi bi-send-check" aria-hidden="true"></i>
                <span>Invia in cucina</span>
                <span v-if="itemsTakenCount > 0" class="odp-foot-count">{{ itemsTakenCount }}</span>
            </button>
        </footer>

        <DishPickerOverlay :show="pickerOpen" @close="closePicker" @pick="onPickDish" />
    </div>
</template>

<style scoped>
.odp-shell {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 100px);
    background: var(--bg);
    color: var(--ink);
    font-family: var(--f-sans);
    position: relative;
}

/* ─────────────── Header ─────────────── */
.odp-head {
    flex-shrink: 0;
    padding: 18px 28px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    display: flex;
    align-items: flex-start;
    gap: 14px;
}
.odp-back-btn {
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
.odp-back-btn:hover { background: var(--bg-hover); color: var(--ink); }
.odp-back-btn i { font-size: 16px; }
.odp-head-block { flex: 1; min-width: 0; }
.odp-crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 8px;
}
.odp-crumb--current { color: var(--ink); font-weight: 600; }
.odp-crumb-sep { color: var(--ink-3); opacity: 0.6; }
.odp-title {
    margin: 0;
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--ink);
}
.odp-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 6px;
    font-size: 13px;
    color: var(--ink-3);
}
.odp-meta i { margin-right: 4px; opacity: 0.85; }
.odp-meta-total {
    margin-left: auto;
    font-family: var(--f-mono);
    font-weight: 700;
    font-size: 16px;
    color: var(--ink);
}

/* ─────────────── Banner ─────────────── */
.odp-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 28px;
    font-size: 13.5px;
    border-bottom: 1px solid var(--line);
}
.odp-banner--error {
    background: color-mix(in oklab, var(--danger) 8%, var(--paper));
    color: var(--danger);
}
.odp-banner-close {
    margin-left: auto;
    appearance: none;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
}
.odp-banner-close:hover { background: color-mix(in oklab, currentColor 15%, transparent); }

.odp-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 56px 16px;
    color: var(--ink-3);
    font-size: 14px;
}

/* ─────────────── Selettore portate ─────────────── */
.odp-courses {
    flex-shrink: 0;
    padding: 14px 28px;
    border-bottom: 1px solid var(--line);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 5;
}
.odp-courses-label {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-bottom: 8px;
}
.odp-courses-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}
.odp-course-chip {
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
    position: relative;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.odp-course-chip:hover:not(:disabled) { background: var(--bg-hover); }
.odp-course-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.odp-course-chip--active {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
}
.odp-course-chip--icon { width: 36px; padding: 0; justify-content: center; }
.odp-course-count {
    font-family: var(--f-mono);
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
    padding: 1px 6px;
    background: color-mix(in oklab, currentColor 10%, transparent);
    border-radius: 999px;
}
.odp-course-pulse {
    position: absolute;
    top: 4px; right: 4px;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--ac);
    box-shadow: 0 0 0 2px var(--bg);
}

/* ─────────────── Body sezioni ─────────────── */
.odp-body {
    flex: 1;
    min-height: 0;
    padding: 20px 28px 100px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.odp-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.odp-section-head {
    display: flex;
    align-items: center;
    gap: 10px;
}
.odp-section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    color: var(--ink);
}
.odp-section-meta {
    font-family: var(--f-mono);
    font-size: 11px;
    color: var(--ink-3);
    padding: 2px 8px;
    background: var(--bg-sunk);
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
}

.odp-empty {
    padding: 18px 16px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    background: var(--bg-sunk);
    color: var(--ink-3);
    font-size: 13px;
    text-align: center;
}

.odp-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.odp-item {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    transition: box-shadow var(--dur-fast);
}
.odp-item--locked {
    background: var(--bg-sunk);
    opacity: 0.92;
}
.odp-item-view {
    display: flex;
    align-items: center;
    gap: 16px;
}
.odp-item-main { flex: 1; min-width: 0; }
.odp-item-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
}
.odp-item-notes {
    font-size: 12px;
    color: var(--ink-3);
    margin-top: 2px;
}
.odp-item-notes i { color: var(--ac); margin-right: 4px; }
.odp-item-qty {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    color: var(--ink-2);
    font-family: var(--f-mono);
    font-size: 14px;
}
.odp-item-qty-x { opacity: 0.5; font-size: 12px; }
.odp-item-qty strong { color: var(--ink); }
.odp-item-price {
    font-family: var(--f-mono);
    font-weight: 700;
    color: var(--ink);
    min-width: 70px;
    text-align: right;
}
.odp-item-actions {
    display: inline-flex;
    gap: 4px;
}
.odp-icon-btn {
    appearance: none;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.odp-icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.odp-icon-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.odp-icon-btn i { font-size: 13px; }
.odp-icon-btn--danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--danger) 10%, var(--paper));
    color: var(--danger);
    border-color: color-mix(in oklab, var(--danger) 30%, transparent);
}

.odp-status-badge {
    font-family: var(--f-mono);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--bg-sunk);
    color: var(--ink-3);
}
.odp-status-badge.s-taken { background: color-mix(in oklab, var(--ac) 12%, transparent); color: var(--ac); }
.odp-status-badge.s-preparing { background: color-mix(in oklab, var(--warn, var(--ac)) 14%, transparent); color: var(--warn, var(--ac)); }
.odp-status-badge.s-ready { background: color-mix(in oklab, var(--ok, #16a34a) 14%, transparent); color: var(--ok, #16a34a); }
.odp-status-badge.s-served { background: var(--bg-sunk); color: var(--ink-3); }

/* Inline edit */
.odp-item-edit {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.odp-item-edit-name { font-size: 14px; font-weight: 600; color: var(--ink); }
.odp-item-edit-fields { display: flex; gap: 12px; }
.odp-edit-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.odp-edit-label { font-size: 11.5px; font-weight: 600; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.06em; }
.odp-edit-input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font-family: inherit;
    font-size: 13.5px;
    outline: none;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.odp-edit-input:focus { border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }
.odp-item-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }

.odp-add-btn {
    appearance: none;
    width: 100%;
    height: 44px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    background: transparent;
    color: var(--ink-2);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.odp-add-btn:hover {
    background: var(--bg-hover);
    border-color: var(--ac);
    color: var(--ac);
}
.odp-add-btn i { font-size: 16px; }

/* ─────────────── Sticky footer ─────────────── */
.odp-foot {
    position: sticky;
    bottom: 0;
    left: 0; right: 0;
    height: 68px;
    border-top: 1px solid var(--line);
    background: var(--paper);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 28px;
    z-index: 20;
}
.odp-foot-left { display: flex; align-items: center; gap: 16px; flex: 1; }
.odp-foot-hint { font-size: 12.5px; color: var(--ink-3); }
.odp-foot-count {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    padding: 0 8px;
    margin-left: 8px;
    border-radius: 999px;
    background: color-mix(in oklab, white 25%, transparent);
    color: var(--bg);
    font-family: var(--f-mono);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.odp-btn {
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
.odp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.odp-btn--ghost { background: var(--paper); color: var(--ink-2); }
.odp-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.odp-btn--primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.odp-btn--primary:hover:not(:disabled) { background: var(--ac); border-color: var(--ac); }
.odp-btn--send { font-weight: 600; }
.odp-btn--accent {
    background: var(--ac, var(--ink));
    color: var(--bg, #fff);
    border-color: var(--ac, var(--ink));
}
.odp-btn--accent:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ac, var(--ink)) 88%, black);
    border-color: color-mix(in oklab, var(--ac, var(--ink)) 88%, black);
}
.odp-btn--sm { height: 32px; padding: 0 10px; font-size: 13px; }
.odp-btn i { font-size: 14px; }

.odp-spin {
    display: inline-block;
    animation: odp-spin-anim 0.8s linear infinite;
}
@keyframes odp-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.odp-fade-enter-active, .odp-fade-leave-active { transition: opacity 180ms, transform 180ms; }
.odp-fade-enter-from, .odp-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* ─────────────── Responsive ─────────────── */
@media (max-width: 860px) {
    .odp-head { padding: 14px 16px; flex-wrap: wrap; }
    .odp-meta { gap: 10px; flex-wrap: wrap; }
    .odp-meta-total { margin-left: 0; }
    .odp-courses { padding: 12px 16px; }
    .odp-body { padding: 16px 16px 100px; }
    .odp-foot { padding: 0 16px; flex-wrap: wrap; height: auto; min-height: 68px; padding-top: 8px; padding-bottom: 8px; }
    .odp-foot-hint { display: none; }
}
@media (max-width: 640px) {
    .odp-item-view { flex-wrap: wrap; }
    .odp-item-main { flex-basis: 100%; }
    .odp-item-edit-fields { flex-direction: column; }
}
</style>

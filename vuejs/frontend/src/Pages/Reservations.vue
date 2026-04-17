<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import ReservationColumn from '@/components/ReservationColumn.vue';
import ReservationCard from '@/components/ReservationCard.vue';
import OccupiedOrderCard from '@/components/OccupiedOrderCard.vue';
import ReservationCreateModal from '@/components/ReservationCreateModal.vue';
import {
    fetchReservations,
    updateReservationStatus,
    reservationErrorMessage,
    fetchOrders,
    orderErrorMessage,
} from '@/utils';

const store = useStore();
const router = useRouter();
const token = computed(() => store.getters.getToken);

const POLL_INTERVAL_MS = 20000;

const reservations = ref([]);
const activeOrders = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const errorMessage = ref('');
const toast = ref(null);
const busyIds = ref(new Set());

const showCreateModal = ref(false);
const activeTab = ref('pending'); // mobile tabs
const fromDate = ref(todayISO());

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// Range di default: dal giorno selezionato (00:00 locale) in poi
const buildParams = () => {
    const params = {
        pageSize: 100,
        sort: 'datetime:asc',
        // Tutti gli stati "attivi": escludiamo completed/cancelled
        status: 'pending,confirmed,at_restaurant',
    };
    if (fromDate.value) {
        const fromISO = new Date(`${fromDate.value}T00:00:00`).toISOString();
        params.from = fromISO;
    }
    return params;
};

const loadReservations = async ({ silent = false } = {}) => {
    if (!token.value) return;
    if (silent) refreshing.value = true; else loading.value = true;
    try {
        const [resvResp, ordersResp] = await Promise.all([
            fetchReservations(buildParams(), token.value),
            fetchOrders({ status: 'active', pageSize: 100 }, token.value)
                .catch((err) => ({ __err: orderErrorMessage(err) })),
        ]);
        reservations.value = Array.isArray(resvResp?.data) ? resvResp.data : [];
        if (ordersResp && !ordersResp.__err) {
            activeOrders.value = Array.isArray(ordersResp.data) ? ordersResp.data : [];
            errorMessage.value = '';
        } else {
            // Non bloccare la pagina se la fetch ordini fallisce: manteniamo le prenotazioni.
            activeOrders.value = [];
            errorMessage.value = ordersResp?.__err || '';
        }
    } catch (err) {
        errorMessage.value = reservationErrorMessage(err);
    } finally {
        loading.value = false;
        refreshing.value = false;
    }
};

// Filtra per status
const byStatus = (status) => reservations.value.filter(r => r.status === status);

const pendingList = computed(() => byStatus('pending'));
const confirmedList = computed(() => byStatus('confirmed'));
const atRestaurantList = computed(() => byStatus('at_restaurant'));

// Ordini attivi (tavoli occupati da ordini in sala), ordinati per apertura desc.
const occupiedOrders = computed(() => {
    const list = Array.isArray(activeOrders.value) ? [...activeOrders.value] : [];
    list.sort((a, b) => {
        const ta = new Date(a?.opened_at || 0).getTime();
        const tb = new Date(b?.opened_at || 0).getTime();
        return tb - ta;
    });
    return list;
});

const occupiedTotalCount = computed(() => atRestaurantList.value.length + occupiedOrders.value.length);

const pendingCount = computed(() => pendingList.value.length);

const handleOpenOrder = (order) => {
    const documentId = order?.documentId;
    if (documentId) {
        router.push({ path: '/orders', query: { order: documentId } });
    } else {
        router.push({ path: '/orders' });
    }
};

// Azione su una card: patch status + feedback
const handleAction = async ({ documentId, next }) => {
    if (!documentId || !next) return;
    busyIds.value = new Set([...busyIds.value, documentId]);
    try {
        const updated = await updateReservationStatus(documentId, next, token.value);
        // Aggiorna in-place
        const idx = reservations.value.findIndex(r => r.documentId === documentId);
        if (idx !== -1 && updated) {
            reservations.value.splice(idx, 1, { ...reservations.value[idx], ...updated });
        }
        showToast('success', transitionToast(next));
        // Se è transitato a cancelled/completed, potrebbe uscire dallo scope dei filtri
        if (next === 'cancelled' || next === 'completed') {
            // Rimuovi dalla lista visibile
            reservations.value = reservations.value.filter(r => r.documentId !== documentId);
        }
    } catch (err) {
        showToast('error', reservationErrorMessage(err));
    } finally {
        const s = new Set(busyIds.value);
        s.delete(documentId);
        busyIds.value = s;
    }
};

const transitionToast = (next) => {
    switch (next) {
        case 'confirmed': return 'Prenotazione accettata.';
        case 'at_restaurant': return 'Cliente segnato come arrivato.';
        case 'completed': return 'Prenotazione completata.';
        case 'cancelled': return 'Prenotazione annullata.';
        default: return 'Aggiornamento effettuato.';
    }
};

const showToast = (type, message) => {
    toast.value = { type, message };
    setTimeout(() => { toast.value = null; }, 3500);
};

const onCreated = (created) => {
    if (created && created.documentId) {
        // Aggiunge alla lista; il prossimo polling riordinerà.
        reservations.value = [...reservations.value, created].sort((a, b) => {
            return new Date(a.datetime) - new Date(b.datetime);
        });
    }
    showToast('success', 'Prenotazione creata con successo.');
};

// Polling controllato dalla visibilità della tab
let pollHandle = null;
const startPolling = () => {
    stopPolling();
    pollHandle = setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadReservations({ silent: true });
        }
    }, POLL_INTERVAL_MS);
};
const stopPolling = () => {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
};

const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
        loadReservations({ silent: true });
    }
};

onMounted(() => {
    nextTick(() => { document.title = 'Prenotazioni'; });
    loadReservations();
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
    <AppLayout>
        <div class="res-page">
            <div class="res-container">
                <!-- Header -->
                <header class="res-header">
                    <div class="res-header-left">
                        <p class="text-overline">Gestione</p>
                        <h1 class="res-title">
                            Prenotazioni
                            <span v-if="pendingCount > 0" class="res-title-badge" :aria-label="`${pendingCount} richieste in attesa`">
                                {{ pendingCount }}
                            </span>
                        </h1>
                        <p class="res-subtitle">Monitora richieste, conferme e coperti in sala in tempo reale.</p>
                    </div>
                    <div class="res-header-actions">
                        <div class="res-date-filter">
                            <label for="res-from" class="visually-hidden">Mostra dal giorno</label>
                            <i class="bi bi-calendar3 date-filter-icon" aria-hidden="true"></i>
                            <input
                                id="res-from"
                                type="date"
                                v-model="fromDate"
                                class="ds-input date-filter-input"
                                @change="loadReservations()"
                            >
                        </div>
                        <button
                            type="button"
                            class="ds-btn ds-btn-secondary"
                            @click="loadReservations({ silent: true })"
                            :disabled="loading || refreshing"
                            aria-label="Ricarica prenotazioni"
                        >
                            <span v-if="refreshing" class="ds-spinner" aria-hidden="true"></span>
                            <template v-else>
                                <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                                <span>Aggiorna</span>
                            </template>
                        </button>
                        <button
                            type="button"
                            class="ds-btn ds-btn-primary"
                            @click="showCreateModal = true"
                        >
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                            <span>Nuova prenotazione</span>
                        </button>
                    </div>
                </header>

                <!-- Toast -->
                <Transition name="fade">
                    <div
                        v-if="toast"
                        :class="['res-toast', `res-toast-${toast.type}`]"
                        role="status"
                        aria-live="polite"
                    >
                        <i :class="['bi', toast.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle']" aria-hidden="true"></i>
                        <span>{{ toast.message }}</span>
                    </div>
                </Transition>

                <!-- Error banner -->
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error res-error-banner" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <!-- Loading state -->
                <div v-if="loading && reservations.length === 0" class="res-loading" role="status" aria-live="polite">
                    <span class="ds-spinner ds-spinner-lg" aria-hidden="true"></span>
                    <p>Caricamento prenotazioni...</p>
                </div>

                <!-- Mobile tabs -->
                <div class="res-tabs" role="tablist" aria-label="Filtro stato prenotazione">
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="activeTab === 'pending'"
                        :class="['res-tab', { active: activeTab === 'pending' }]"
                        @click="activeTab = 'pending'"
                    >
                        Richieste
                        <span class="res-tab-count" v-if="pendingList.length">{{ pendingList.length }}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="activeTab === 'confirmed'"
                        :class="['res-tab', { active: activeTab === 'confirmed' }]"
                        @click="activeTab = 'confirmed'"
                    >
                        Confermate
                        <span class="res-tab-count" v-if="confirmedList.length">{{ confirmedList.length }}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="activeTab === 'at_restaurant'"
                        :class="['res-tab', { active: activeTab === 'at_restaurant' }]"
                        @click="activeTab = 'at_restaurant'"
                    >
                        In sala
                        <span class="res-tab-count" v-if="occupiedTotalCount">{{ occupiedTotalCount }}</span>
                    </button>
                </div>

                <!-- Desktop Kanban -->
                <div class="res-board" v-if="!(loading && reservations.length === 0)">
                    <ReservationColumn
                        class="res-board-col col-pending"
                        title="Richieste"
                        icon="bi-hourglass-split"
                        tone="warning"
                        :reservations="pendingList"
                        :busy-ids="busyIds"
                        empty-message="Nessuna richiesta in attesa."
                        @action="handleAction"
                    />
                    <ReservationColumn
                        class="res-board-col col-confirmed"
                        title="Confermate"
                        icon="bi-check2-circle"
                        tone="primary"
                        :reservations="confirmedList"
                        :busy-ids="busyIds"
                        empty-message="Nessuna prenotazione confermata."
                        @action="handleAction"
                    />
                    <section
                        class="res-col res-board-col col-at-restaurant"
                        data-tone="accent"
                        aria-labelledby="res-col-occupied-title"
                    >
                        <header class="res-col-header">
                            <div class="res-col-title-wrap">
                                <span class="res-col-icon" aria-hidden="true">
                                    <i class="bi bi-people-fill"></i>
                                </span>
                                <h3 id="res-col-occupied-title" class="res-col-title">Tavoli occupati</h3>
                            </div>
                            <span class="res-col-count" aria-label="Numero tavoli occupati">
                                {{ occupiedTotalCount }}
                            </span>
                        </header>
                        <div class="res-col-body">
                            <template v-if="occupiedTotalCount">
                                <div class="res-col-list">
                                    <ReservationCard
                                        v-for="r in atRestaurantList"
                                        :key="`resv-${r.documentId}`"
                                        :reservation="r"
                                        :busy="busyIds.has(r.documentId)"
                                        @action="handleAction"
                                    />
                                    <OccupiedOrderCard
                                        v-for="o in occupiedOrders"
                                        :key="`ord-${o.documentId}`"
                                        :order="o"
                                        @open="handleOpenOrder"
                                    />
                                </div>
                            </template>
                            <div v-else class="res-col-empty">
                                <div class="ds-empty-icon">
                                    <i class="bi bi-people-fill" aria-hidden="true"></i>
                                </div>
                                <p class="ds-empty-description">Nessun tavolo attualmente occupato.</p>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Mobile single-column view (driven by tabs) -->
                <div class="res-mobile-view" v-if="!(loading && reservations.length === 0)">
                    <template v-if="activeTab === 'pending'">
                        <div v-if="pendingList.length" class="res-mobile-list">
                            <TransitionGroup name="list">
                                <ReservationCard
                                    v-for="r in pendingList"
                                    :key="r.documentId"
                                    :reservation="r"
                                    :busy="busyIds.has(r.documentId)"
                                    @action="handleAction"
                                />
                            </TransitionGroup>
                        </div>
                        <div v-else class="ds-empty">
                            <div class="ds-empty-icon"><i class="bi bi-hourglass-split"></i></div>
                            <p class="ds-empty-description">Nessuna richiesta in attesa.</p>
                        </div>
                    </template>
                    <template v-else-if="activeTab === 'confirmed'">
                        <div v-if="confirmedList.length" class="res-mobile-list">
                            <TransitionGroup name="list">
                                <ReservationCard
                                    v-for="r in confirmedList"
                                    :key="r.documentId"
                                    :reservation="r"
                                    :busy="busyIds.has(r.documentId)"
                                    @action="handleAction"
                                />
                            </TransitionGroup>
                        </div>
                        <div v-else class="ds-empty">
                            <div class="ds-empty-icon"><i class="bi bi-check2-circle"></i></div>
                            <p class="ds-empty-description">Nessuna prenotazione confermata.</p>
                        </div>
                    </template>
                    <template v-else>
                        <div v-if="occupiedTotalCount" class="res-mobile-list">
                            <ReservationCard
                                v-for="r in atRestaurantList"
                                :key="`m-resv-${r.documentId}`"
                                :reservation="r"
                                :busy="busyIds.has(r.documentId)"
                                @action="handleAction"
                            />
                            <OccupiedOrderCard
                                v-for="o in occupiedOrders"
                                :key="`m-ord-${o.documentId}`"
                                :order="o"
                                @open="handleOpenOrder"
                            />
                        </div>
                        <div v-else class="ds-empty">
                            <div class="ds-empty-icon"><i class="bi bi-people-fill"></i></div>
                            <p class="ds-empty-description">Nessun tavolo attualmente occupato.</p>
                        </div>
                    </template>
                </div>
            </div>

            <ReservationCreateModal
                :show="showCreateModal"
                :token="token"
                @close="showCreateModal = false"
                @created="onCreated"
            />
        </div>
    </AppLayout>
</template>

<style scoped>
.res-page {
    padding: var(--space-8) 0 var(--space-12);
}

.res-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

/* Header */
.res-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
}

.res-header-left {
    flex: 1;
    min-width: 240px;
}

.res-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: var(--space-2) 0;
    letter-spacing: var(--tracking-tight);
}

.res-title-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--space-2);
    background: var(--color-destructive);
    color: var(--color-text-inverse);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
}

.res-subtitle {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin: 0;
}

.res-header-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
}

.res-date-filter {
    position: relative;
    display: flex;
    align-items: center;
}

.date-filter-icon {
    position: absolute;
    left: var(--space-3);
    color: var(--color-text-muted);
    pointer-events: none;
    z-index: 1;
}

.date-filter-input {
    padding-left: calc(var(--space-3) + 20px);
    min-width: 170px;
}

/* Toast */
.res-toast {
    position: fixed;
    top: 72px;
    right: var(--space-6);
    z-index: var(--z-toast);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-sm);
    font-weight: 500;
    max-width: 400px;
}

.res-toast-success {
    background: var(--color-accent-light);
    color: var(--color-accent);
    border: 1px solid rgba(5, 150, 105, 0.2);
}

.res-toast-error {
    background: var(--color-destructive-light);
    color: var(--color-destructive);
    border: 1px solid rgba(220, 38, 38, 0.2);
}

.res-error-banner {
    margin-bottom: var(--space-4);
}

/* Loading */
.res-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-12);
    color: var(--color-text-muted);
}

/* Board */
.res-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    align-items: flex-start;
}

.res-board-col {
    max-height: calc(100vh - 220px);
}

/* Evidenziazione colonna pending */
.col-pending {
    border-color: var(--color-warning);
    box-shadow: 0 0 0 1px var(--color-warning-light);
}

/* Stili colonna inline "Tavoli occupati" (allineati a ReservationColumn) */
.res-col {
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    min-height: 280px;
    overflow: hidden;
}
.res-col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border);
}
.res-col-title-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.res-col-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
}
.res-col-title {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
}
.res-col-count {
    min-width: 26px;
    height: 24px;
    padding: 0 var(--space-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: var(--radius-full);
    background: var(--color-bg-subtle);
    color: var(--color-text-secondary);
}
.res-col[data-tone="accent"] .res-col-icon {
    background: var(--color-accent-light);
    color: var(--color-accent);
}
.res-col[data-tone="accent"] .res-col-count {
    background: var(--color-accent-light);
    color: var(--color-accent);
}
.res-col-body {
    flex: 1;
    padding: var(--space-3);
    overflow-y: auto;
}
.res-col-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}
.res-col-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-8) var(--space-3);
    gap: var(--space-2);
    color: var(--color-text-muted);
}

/* Tabs mobile */
.res-tabs {
    display: none;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
}

.res-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.res-tab:hover {
    color: var(--color-text);
}

.res-tab.active {
    background: var(--color-bg-elevated);
    color: var(--color-text);
    box-shadow: var(--shadow-xs);
}

.res-tab-count {
    min-width: 20px;
    padding: 0 6px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    background: var(--color-bg-muted);
    color: var(--color-text-secondary);
    border-radius: var(--radius-full);
}

.res-tab.active .res-tab-count {
    background: var(--color-primary-light);
    color: var(--color-primary);
}

.res-mobile-view {
    display: none;
}

.res-mobile-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

/* Visually hidden */
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Responsive — tablet e mobile passano a tab layout */
@media (max-width: 991px) {
    .res-board { display: none; }
    .res-tabs { display: flex; }
    .res-mobile-view { display: block; }
}

@media (max-width: 640px) {
    .res-container { padding: 0 var(--space-4); }
    .res-header { align-items: flex-start; }
    .res-header-actions {
        width: 100%;
    }
    .res-header-actions .ds-btn {
        flex: 1;
    }
    .res-toast {
        top: 60px;
        right: var(--space-3);
        left: var(--space-3);
        max-width: none;
    }
}
</style>

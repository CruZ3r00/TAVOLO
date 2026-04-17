<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import OrdersTableGrid from '@/components/OrdersTableGrid.vue';
import KitchenBoard from '@/components/KitchenBoard.vue';
import OrderDetailModal from '@/components/OrderDetailModal.vue';
import AddItemModal from '@/components/AddItemModal.vue';
import CheckoutModal from '@/components/CheckoutModal.vue';
import TableManagerModal from '@/components/TableManagerModal.vue';
import {
    fetchTables, fetchOrders, openOrder, closeOrder,
    addOrderItem, updateItemStatus, orderErrorMessage,
} from '@/utils';

const store = useStore();
const route = useRoute();
const token = computed(() => store.getters.getToken);

const POLL_INTERVAL_MS = 20000;

// --- State ---
const tables = ref([]);
const orders = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const errorMessage = ref('');
const toast = ref(null);

// Modalita: cameriere | cucina
const mode = ref(localStorage.getItem('orders_mode') || 'cameriere');
const setMode = (m) => {
    mode.value = m;
    localStorage.setItem('orders_mode', m);
};

// Modals
const showTableManager = ref(false);
const editingTable = ref(null);
const showOrderDetail = ref(false);
const currentOrderDocId = ref(null);
const showAddItem = ref(false);
const addItemOrderDocId = ref(null);
const addItemLockVersion = ref(0);
const showCheckout = ref(false);
const checkoutOrder = ref(null);

// Kitchen busy tracking
const busyItemIds = ref(new Set());

// Ref al dettaglio ordine per chiamare metodi esposti
const orderDetailRef = ref(null);

// --- Data loading ---
const loadData = async ({ silent = false } = {}) => {
    if (!token.value) return;
    if (silent) refreshing.value = true; else loading.value = true;
    try {
        const [tablesResp, ordersResp] = await Promise.all([
            fetchTables(token.value),
            fetchOrders({ status: 'active', pageSize: 100 }, token.value),
        ]);
        tables.value = Array.isArray(tablesResp?.data) ? tablesResp.data : [];
        orders.value = Array.isArray(ordersResp?.data) ? ordersResp.data : [];
        errorMessage.value = '';
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
    } finally {
        loading.value = false;
        refreshing.value = false;
    }
};

// --- Toast ---
const showToast = (type, message) => {
    toast.value = { type, message };
    setTimeout(() => { toast.value = null; }, 3500);
};

// --- Table actions ---
const handleOpenOrder = async (table) => {
    try {
        const created = await openOrder({ table_id: table.documentId }, token.value);
        showToast('success', `Ordine aperto per tavolo ${table.number}.`);
        // Aggiorna dati
        await loadData({ silent: true });
        // Apri dettaglio dell'ordine appena creato
        currentOrderDocId.value = created.documentId;
        showOrderDetail.value = true;
    } catch (err) {
        showToast('error', orderErrorMessage(err));
    }
};

const handleViewOrder = (order) => {
    currentOrderDocId.value = order.documentId;
    showOrderDetail.value = true;
};

const handleEditTable = (table) => {
    editingTable.value = table;
    showTableManager.value = true;
};

const handleDeleteTable = async (table) => {
    // La conferma e gestita dal TableManagerModal, qui apriamo il manager
    editingTable.value = null;
    showTableManager.value = true;
};

const onTableManagerUpdated = async () => {
    await loadData({ silent: true });
};

// --- Order detail events ---
const onOrderUpdated = async () => {
    await loadData({ silent: true });
};

const onOpenAddItem = ({ orderDocumentId, lockVersion }) => {
    addItemOrderDocId.value = orderDocumentId;
    addItemLockVersion.value = lockVersion;
    showAddItem.value = true;
};

const onAddItem = async (payload) => {
    try {
        await addOrderItem(addItemOrderDocId.value, payload, token.value);
        showAddItem.value = false;
        // Notifica il detail modal per ricaricare items
        if (orderDetailRef.value) {
            await orderDetailRef.value.onItemAdded();
        }
        await loadData({ silent: true });
    } catch (err) {
        if (err?.code === 'STALE_ORDER') {
            showAddItem.value = false;
            if (orderDetailRef.value) await orderDetailRef.value.silentReload();
            showToast('error', 'Dati obsoleti, aggiornati. Riprova.');
        } else {
            showToast('error', orderErrorMessage(err));
        }
    }
};

const onOpenCheckout = (order) => {
    checkoutOrder.value = order;
    showCheckout.value = true;
};

const onConfirmCheckout = async (payload) => {
    if (!checkoutOrder.value) return;
    try {
        const result = await closeOrder(checkoutOrder.value.documentId, payload, token.value);
        showCheckout.value = false;
        showOrderDetail.value = false;
        currentOrderDocId.value = null;
        showToast('success', `Conto chiuso. Rif: ${result.payment?.transactionId || 'OK'}`);
        await loadData({ silent: true });
    } catch (err) {
        if (err?.code === 'STALE_ORDER') {
            showCheckout.value = false;
            if (orderDetailRef.value) await orderDetailRef.value.silentReload();
            showToast('error', 'Dati obsoleti, aggiornati. Riprova il pagamento.');
        } else {
            showToast('error', orderErrorMessage(err));
        }
    }
};

// --- Kitchen actions ---
const handleKitchenAdvance = async ({ item, next, orderDocumentId }) => {
    const s = new Set(busyItemIds.value);
    s.add(item.documentId);
    busyItemIds.value = s;

    // Optimistic: aggiorna stato locale
    const orderIdx = orders.value.findIndex(o => o.documentId === orderDocumentId);
    let oldStatus = item.status;
    if (orderIdx !== -1) {
        const itemInOrder = orders.value[orderIdx].items?.find(i => i.documentId === item.documentId);
        if (itemInOrder) {
            oldStatus = itemInOrder.status;
            itemInOrder.status = next;
        }
    }

    try {
        await updateItemStatus(orderDocumentId, item.documentId, next, token.value);
        showToast('success', `"${item.name}" → ${statusLabel(next)}`);
    } catch (err) {
        // Rollback
        if (orderIdx !== -1) {
            const itemInOrder = orders.value[orderIdx].items?.find(i => i.documentId === item.documentId);
            if (itemInOrder) itemInOrder.status = oldStatus;
        }
        showToast('error', orderErrorMessage(err));
    } finally {
        const s2 = new Set(busyItemIds.value);
        s2.delete(item.documentId);
        busyItemIds.value = s2;
    }
};

function statusLabel(status) {
    switch (status) {
        case 'preparing': return 'In preparazione';
        case 'ready': return 'Pronto';
        case 'served': return 'Servito';
        default: return status;
    }
}

// --- Polling ---
let pollHandle = null;
const startPolling = () => {
    stopPolling();
    pollHandle = setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadData({ silent: true });
        }
    }, POLL_INTERVAL_MS);
};
const stopPolling = () => {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
};

const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
        loadData({ silent: true });
    }
};

// Apre il dettaglio ordine se la route ha il query param ?order=<documentId>.
// Usato dalla pagina Prenotazioni per deep-link su un ordine attivo.
// Non puliamo il query param per evitare remount (App.vue usa route.fullPath come key).
const openOrderFromQuery = () => {
    const docId = typeof route.query?.order === 'string' ? route.query.order : null;
    if (!docId) return;
    currentOrderDocId.value = docId;
    showOrderDetail.value = true;
};

onMounted(async () => {
    document.title = 'Ordinazioni';
    await loadData();
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    openOrderFromQuery();
});

onBeforeUnmount(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', onVisibilityChange);
});

const openTableManagerNew = () => {
    editingTable.value = null;
    showTableManager.value = true;
};
</script>

<template>
    <AppLayout>
        <div class="ord-page">
            <div class="ord-container">
                <!-- Header -->
                <header class="ord-header">
                    <div class="ord-header-left">
                        <p class="text-overline">Gestione</p>
                        <h1 class="ord-title">Ordinazioni</h1>
                        <p class="ord-subtitle">
                            {{ mode === 'cameriere' ? 'Gestisci tavoli e ordini in sala.' : 'Visualizza e lavora i piatti in cucina.' }}
                        </p>
                    </div>
                    <div class="ord-header-actions">
                        <!-- Toggle cameriere / cucina -->
                        <div class="ord-mode-toggle" role="tablist" aria-label="Modalita vista">
                            <button
                                type="button"
                                role="tab"
                                :aria-selected="mode === 'cameriere'"
                                :class="['ord-mode-btn', { active: mode === 'cameriere' }]"
                                @click="setMode('cameriere')"
                            >
                                <i class="bi bi-person-badge" aria-hidden="true"></i>
                                Cameriere
                            </button>
                            <button
                                type="button"
                                role="tab"
                                :aria-selected="mode === 'cucina'"
                                :class="['ord-mode-btn', { active: mode === 'cucina' }]"
                                @click="setMode('cucina')"
                            >
                                <i class="bi bi-fire" aria-hidden="true"></i>
                                Cucina
                            </button>
                        </div>

                        <button
                            type="button"
                            class="ds-btn ds-btn-secondary"
                            @click="loadData({ silent: true })"
                            :disabled="loading || refreshing"
                            aria-label="Ricarica dati"
                        >
                            <span v-if="refreshing" class="ds-spinner" aria-hidden="true"></span>
                            <template v-else>
                                <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                                <span>Aggiorna</span>
                            </template>
                        </button>

                        <button
                            v-if="mode === 'cameriere'"
                            type="button"
                            class="ds-btn ds-btn-primary"
                            @click="openTableManagerNew"
                        >
                            <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>
                            <span>Gestisci tavoli</span>
                        </button>
                    </div>
                </header>

                <!-- Toast -->
                <Transition name="fade">
                    <div
                        v-if="toast"
                        :class="['ord-toast', `ord-toast-${toast.type}`]"
                        role="status"
                        aria-live="polite"
                    >
                        <i :class="['bi', toast.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle']" aria-hidden="true"></i>
                        <span>{{ toast.message }}</span>
                    </div>
                </Transition>

                <!-- Error banner -->
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error ord-error-banner" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <!-- Loading -->
                <div v-if="loading && tables.length === 0 && orders.length === 0" class="ord-loading" role="status" aria-live="polite">
                    <span class="ds-spinner ds-spinner-lg" aria-hidden="true"></span>
                    <p>Caricamento...</p>
                </div>

                <!-- Content -->
                <template v-if="!(loading && tables.length === 0 && orders.length === 0)">
                    <!-- Cameriere mode: griglia tavoli -->
                    <div v-if="mode === 'cameriere'">
                        <OrdersTableGrid
                            :tables="tables"
                            :orders="orders"
                            @open-order="handleOpenOrder"
                            @view-order="handleViewOrder"
                            @edit-table="handleEditTable"
                            @delete-table="handleDeleteTable"
                        />
                    </div>

                    <!-- Cucina mode: kitchen board -->
                    <div v-else>
                        <KitchenBoard
                            :orders="orders"
                            :busy-item-ids="busyItemIds"
                            @advance="handleKitchenAdvance"
                        />
                    </div>
                </template>
            </div>

            <!-- Modals -->
            <TableManagerModal
                :show="showTableManager"
                :token="token"
                :tables="tables"
                :editing-table="editingTable"
                @close="showTableManager = false"
                @updated="onTableManagerUpdated"
            />

            <OrderDetailModal
                ref="orderDetailRef"
                :show="showOrderDetail"
                :order-document-id="currentOrderDocId"
                :token="token"
                @close="showOrderDetail = false"
                @order-updated="onOrderUpdated"
                @open-add-item="onOpenAddItem"
                @open-checkout="onOpenCheckout"
            />

            <AddItemModal
                :show="showAddItem"
                :order-document-id="addItemOrderDocId"
                :lock-version="addItemLockVersion"
                @close="showAddItem = false"
                @add="onAddItem"
            />

            <CheckoutModal
                :show="showCheckout"
                :order="checkoutOrder"
                @close="showCheckout = false"
                @confirm="onConfirmCheckout"
            />
        </div>
    </AppLayout>
</template>

<style scoped>
.ord-page {
    padding: var(--space-8) 0 var(--space-12);
}

.ord-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

/* Header */
.ord-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
}

.ord-header-left {
    flex: 1;
    min-width: 240px;
}

.ord-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: var(--space-2) 0;
    letter-spacing: var(--tracking-tight);
}

.ord-subtitle {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin: 0;
}

.ord-header-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
}

/* Mode toggle */
.ord-mode-toggle {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
}
.ord-mode-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
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
.ord-mode-btn:hover {
    color: var(--color-text);
}
.ord-mode-btn.active {
    background: var(--color-bg-elevated);
    color: var(--color-text);
    box-shadow: var(--shadow-xs);
}

/* Toast */
.ord-toast {
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
.ord-toast-success {
    background: var(--color-accent-light);
    color: var(--color-accent);
    border: 1px solid rgba(5, 150, 105, 0.2);
}
.ord-toast-error {
    background: var(--color-destructive-light);
    color: var(--color-destructive);
    border: 1px solid rgba(220, 38, 38, 0.2);
}

.ord-error-banner {
    margin-bottom: var(--space-4);
}

/* Loading */
.ord-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-12);
    color: var(--color-text-muted);
}

/* Responsive */
@media (max-width: 640px) {
    .ord-container { padding: 0 var(--space-4); }
    .ord-header { align-items: flex-start; }
    .ord-header-actions {
        width: 100%;
    }
    .ord-toast {
        top: 60px;
        right: var(--space-3);
        left: var(--space-3);
        max-width: none;
    }
}
</style>

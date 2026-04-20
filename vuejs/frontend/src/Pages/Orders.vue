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
import {
    fetchTables, fetchOrders, closeOrder,
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
const handleViewOrder = (order) => {
    if (!order?.documentId) return;
    currentOrderDocId.value = order.documentId;
    showOrderDetail.value = true;
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
</script>

<template>
    <AppLayout>
        <div class="ord-page" :data-role="mode === 'cucina' ? 'cucina' : 'cameriere'">
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
                            @view-order="handleViewOrder"
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
    padding: var(--s-7) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
}

.ord-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--s-6);
}

.text-overline {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    margin: 0 0 6px;
}

.ord-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-6);
    flex-wrap: wrap;
}

.ord-header-left {
    flex: 1;
    min-width: 240px;
}

.ord-title {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: clamp(28px, 3.5vw, 36px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 4px;
    letter-spacing: -0.02em;
}

.ord-subtitle {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    color: var(--ink-3);
    margin: 0;
}

.ord-header-actions {
    display: flex;
    gap: var(--s-3);
    align-items: center;
    flex-wrap: wrap;
}

.ord-mode-toggle {
    display: flex;
    gap: 2px;
    padding: 4px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.ord-mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
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
.ord-mode-btn i { font-size: 15px; }
.ord-mode-btn:hover {
    color: var(--ink);
    background: color-mix(in oklab, var(--ink) 4%, transparent);
}
.ord-mode-btn.active {
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}

.ord-toast {
    position: fixed;
    top: 80px;
    right: var(--s-5);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--r-md);
    box-shadow: 0 12px 32px -8px color-mix(in oklab, var(--ink) 24%, transparent);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 500;
    max-width: 420px;
    background: var(--paper);
    border: 1px solid var(--line);
}
.ord-toast i { font-size: 16px; flex-shrink: 0; }
.ord-toast-success {
    background: color-mix(in oklab, var(--ok) 10%, var(--paper));
    color: var(--ok);
    border-color: color-mix(in oklab, var(--ok) 30%, transparent);
}
.ord-toast-error {
    background: color-mix(in oklab, var(--dan) 10%, var(--paper));
    color: var(--dan);
    border-color: color-mix(in oklab, var(--dan) 30%, transparent);
}

.ord-error-banner {
    margin-bottom: var(--s-4);
}

.ord-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--s-3);
    padding: var(--s-9);
    color: var(--ink-3);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 640px) {
    .ord-container { padding: 0 var(--s-4); }
    .ord-header { align-items: flex-start; }
    .ord-header-actions { width: 100%; }
    .ord-mode-toggle { flex: 1; }
    .ord-mode-btn { flex: 1; justify-content: center; }
    .ord-toast {
        top: 68px;
        right: var(--s-3);
        left: var(--s-3);
        max-width: none;
    }
}
</style>

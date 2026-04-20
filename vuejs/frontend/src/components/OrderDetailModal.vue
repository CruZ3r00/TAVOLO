<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import OrderItemRow from '@/components/OrderItemRow.vue';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';
import {
    fetchOrder, addOrderItem, updateOrderItem, deleteOrderItem,
    updateItemStatus, orderErrorMessage,
} from '@/utils';

const props = defineProps({
    show: { type: Boolean, default: false },
    orderDocumentId: { type: String, default: null },
    token: { type: String, default: null },
});

const emit = defineEmits(['close', 'order-updated', 'open-add-item', 'open-checkout']);

const order = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref(null);
const busyItemIds = ref(new Set());

watch(() => props.show, async (v) => {
    if (v && props.orderDocumentId) {
        await loadOrder();
    } else {
        order.value = null;
    }
});

const loadOrder = async () => {
    if (!props.orderDocumentId || !props.token) return;
    loading.value = true;
    errorMessage.value = '';
    try {
        order.value = await fetchOrder(props.orderDocumentId, props.token);
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
    } finally {
        loading.value = false;
    }
};

/** Reload ordine in background senza loader intero */
const silentReload = async () => {
    try {
        order.value = await fetchOrder(props.orderDocumentId, props.token);
    } catch (_err) {
        // Silenzioso -- non blocca UX
    }
};

const isActive = computed(() => order.value?.status === 'active');
const totalAmount = computed(() => parseFloat(order.value?.total_amount || 0).toFixed(2));
const tableNumber = computed(() => order.value?.table?.number ?? '?');
const itemsSorted = computed(() => {
    if (!order.value?.items) return [];
    return [...order.value.items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
});

const showToast = (type, message) => {
    toast.value = { type, message };
    setTimeout(() => { toast.value = null; }, 3500);
};

const setBusy = (itemDocId, busy) => {
    const s = new Set(busyItemIds.value);
    if (busy) s.add(itemDocId); else s.delete(itemDocId);
    busyItemIds.value = s;
};

/**
 * Applica risultato ottimistico a un item (aggiorna locale).
 * Su errore 409 STALE_ORDER: ricarica ordine e mostra toast.
 */
const handleStaleError = async (err) => {
    if (err?.code === 'STALE_ORDER') {
        await silentReload();
        showToast('error', 'Dati obsoleti, aggiornati.');
        return true;
    }
    return false;
};

const handleIncrement = async (item) => {
    if (!isActive.value) return;
    const oldQty = item.quantity;
    // Optimistic
    item.quantity = oldQty + 1;
    setBusy(item.documentId, true);
    try {
        const result = await updateOrderItem(
            props.orderDocumentId, item.documentId,
            { quantity: oldQty + 1, lock_version: order.value.lock_version },
            props.token
        );
        order.value.total_amount = result.order.total_amount;
        order.value.lock_version = result.order.lock_version;
        emit('order-updated');
    } catch (err) {
        item.quantity = oldQty;
        if (!(await handleStaleError(err))) {
            showToast('error', orderErrorMessage(err));
        }
    } finally {
        setBusy(item.documentId, false);
    }
};

const handleDecrement = async (item) => {
    if (!isActive.value || item.quantity <= 1) return;
    const oldQty = item.quantity;
    item.quantity = oldQty - 1;
    setBusy(item.documentId, true);
    try {
        const result = await updateOrderItem(
            props.orderDocumentId, item.documentId,
            { quantity: oldQty - 1, lock_version: order.value.lock_version },
            props.token
        );
        order.value.total_amount = result.order.total_amount;
        order.value.lock_version = result.order.lock_version;
        emit('order-updated');
    } catch (err) {
        item.quantity = oldQty;
        if (!(await handleStaleError(err))) {
            showToast('error', orderErrorMessage(err));
        }
    } finally {
        setBusy(item.documentId, false);
    }
};

const handleDelete = async (item) => {
    setBusy(item.documentId, true);
    // Optimistic: rimuovi dalla lista
    const oldItems = [...order.value.items];
    order.value.items = order.value.items.filter(i => i.documentId !== item.documentId);
    try {
        const result = await deleteOrderItem(
            props.orderDocumentId, item.documentId,
            { lock_version: order.value.lock_version },
            props.token
        );
        order.value.total_amount = result.order.total_amount;
        order.value.lock_version = result.order.lock_version;
        showToast('success', 'Elemento rimosso.');
        emit('order-updated');
    } catch (err) {
        order.value.items = oldItems;
        if (!(await handleStaleError(err))) {
            showToast('error', orderErrorMessage(err));
        }
    } finally {
        setBusy(item.documentId, false);
    }
};

const handleServe = async (item) => {
    if (item.status !== 'ready') return;
    const oldStatus = item.status;
    item.status = 'served';
    setBusy(item.documentId, true);
    try {
        await updateItemStatus(
            props.orderDocumentId, item.documentId, 'served', props.token
        );
        showToast('success', `"${item.name}" segnato come servito.`);
        emit('order-updated');
    } catch (err) {
        item.status = oldStatus;
        showToast('error', orderErrorMessage(err));
    } finally {
        setBusy(item.documentId, false);
    }
};

const openAddItem = () => {
    emit('open-add-item', {
        orderDocumentId: props.orderDocumentId,
        lockVersion: order.value?.lock_version ?? 0,
    });
};

const openCheckout = () => {
    emit('open-checkout', order.value);
};

const onClose = () => {
    emit('close');
};

/**
 * Chiamato dal parent dopo che un item e stato aggiunto con successo.
 * Ricarica l'ordine per avere la lista aggiornata.
 */
const onItemAdded = async () => {
    await silentReload();
    showToast('success', 'Piatto aggiunto.');
};

defineExpose({ onItemAdded, silentReload });
</script>

<template>
    <Modal :show="show" @close="onClose">
        <template #title>
            <div class="modal-title-wrap">
                <i class="bi bi-receipt" aria-hidden="true"></i>
                <h2 class="modal-title">
                    Ordine - Tavolo {{ tableNumber }}
                </h2>
                <OrderStatusBadge v-if="order" :status="order.status" />
            </div>
        </template>

        <template #body>
            <div class="odm">
                <!-- Loading -->
                <div v-if="loading" class="odm-loading">
                    <span class="ds-spinner" aria-hidden="true"></span>
                    <span>Caricamento ordine...</span>
                </div>

                <!-- Errore -->
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <!-- Toast -->
                <Transition name="fade">
                    <div
                        v-if="toast"
                        :class="['odm-toast', `odm-toast-${toast.type}`]"
                        role="status"
                        aria-live="polite"
                    >
                        <i :class="['bi', toast.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle']" aria-hidden="true"></i>
                        <span>{{ toast.message }}</span>
                    </div>
                </Transition>

                <template v-if="order && !loading">
                    <!-- Info ordine -->
                    <div class="odm-info">
                        <div class="odm-info-item">
                            <span class="odm-info-label">Aperto</span>
                            <span class="odm-info-value">
                                {{ new Date(order.opened_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }}
                            </span>
                        </div>
                        <div v-if="order.covers" class="odm-info-item">
                            <span class="odm-info-label">Coperti</span>
                            <span class="odm-info-value">{{ order.covers }}</span>
                        </div>
                        <div class="odm-info-item">
                            <span class="odm-info-label">Piatti</span>
                            <span class="odm-info-value">{{ order.items?.length || 0 }}</span>
                        </div>
                    </div>

                    <!-- Lista items -->
                    <div class="odm-items">
                        <div v-if="itemsSorted.length === 0" class="odm-empty">
                            <p>Nessun piatto nell'ordine. Aggiungi il primo piatto.</p>
                        </div>
                        <OrderItemRow
                            v-for="item in itemsSorted"
                            :key="item.documentId"
                            :item="item"
                            :order-active="isActive"
                            :busy="busyItemIds.has(item.documentId)"
                            @increment="handleIncrement"
                            @decrement="handleDecrement"
                            @delete="handleDelete"
                            @serve="handleServe"
                        />
                    </div>

                    <!-- Footer con totale e azioni -->
                    <div class="odm-footer">
                        <div class="odm-total">
                            <span class="odm-total-label">Totale</span>
                            <span class="odm-total-value">&euro; {{ totalAmount }}</span>
                        </div>
                        <div v-if="isActive" class="odm-actions">
                            <button
                                type="button"
                                class="ds-btn ds-btn-secondary"
                                @click="openAddItem"
                            >
                                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                                <span>Aggiungi piatto</span>
                            </button>
                            <button
                                type="button"
                                class="ds-btn ds-btn-primary"
                                @click="openCheckout"
                            >
                                <i class="bi bi-receipt-cutoff" aria-hidden="true"></i>
                                <span>Chiudi conto</span>
                            </button>
                        </div>
                        <div v-else class="odm-closed-info">
                            <i class="bi bi-lock" aria-hidden="true"></i>
                            <span>Ordine chiuso</span>
                            <span v-if="order.payment_reference" class="odm-ref">
                                Rif. {{ order.payment_reference }}
                            </span>
                        </div>
                    </div>
                </template>
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

.odm {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    min-height: 200px;
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.odm-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    padding: var(--s-7);
    color: var(--ink-3);
    font-size: 14px;
}

.odm-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--r-sm);
    font-size: 13px;
    font-weight: 500;
}
.odm-toast i { font-size: 14px; }
.odm-toast-success {
    background: color-mix(in oklab, var(--ok) 10%, var(--paper));
    color: var(--ok);
    border: 1px solid color-mix(in oklab, var(--ok) 28%, transparent);
}
.odm-toast-error {
    background: color-mix(in oklab, var(--dan) 10%, var(--paper));
    color: var(--dan);
    border: 1px solid color-mix(in oklab, var(--dan) 28%, transparent);
}

.odm-info {
    display: flex;
    gap: var(--s-5);
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.odm-info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.odm-info-label {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 500;
}
.odm-info-value {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.01em;
}

.odm-items {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
}
.odm-empty {
    padding: var(--s-6);
    text-align: center;
    color: var(--ink-3);
    font-size: 14px;
    background: var(--bg-2);
    border: 1px dashed var(--line);
    border-radius: var(--r-md);
}

.odm-footer {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    border-top: 1px solid var(--line);
    padding-top: var(--s-4);
}
.odm-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
}
.odm-total-label {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
}
.odm-total-value {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 22px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.02em;
}

.odm-actions {
    display: flex;
    gap: var(--s-3);
}
.odm-actions :deep(.ds-btn) {
    flex: 1;
}

.odm-closed-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    color: var(--ink-3);
}
.odm-ref {
    margin-left: auto;
    font-size: 11px;
    color: var(--ink-3);
}

@media (max-width: 640px) {
    .odm-actions { flex-direction: column; }
    .odm-info { flex-wrap: wrap; }
}
</style>

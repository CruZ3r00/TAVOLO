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
    gap: var(--space-2);
    color: var(--color-primary);
}
.modal-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.odm {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 200px;
}

.odm-loading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-content: center;
    padding: var(--space-8);
    color: var(--color-text-muted);
}

.odm-toast {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
}
.odm-toast-success {
    background: var(--color-accent-light);
    color: var(--color-accent);
    border: 1px solid rgba(5, 150, 105, 0.2);
}
.odm-toast-error {
    background: var(--color-destructive-light);
    color: var(--color-destructive);
    border: 1px solid rgba(220, 38, 38, 0.2);
}

.odm-info {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-3);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
}
.odm-info-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.odm-info-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.odm-info-value {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
}

.odm-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 360px;
    overflow-y: auto;
}
.odm-empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
}

.odm-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-3);
}
.odm-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.odm-total-label {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--color-text);
}
.odm-total-value {
    font-size: var(--text-xl, 1.25rem);
    font-weight: 700;
    color: var(--color-primary);
}

.odm-actions {
    display: flex;
    gap: var(--space-3);
}
.odm-actions .ds-btn {
    flex: 1;
}

.odm-closed-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
}
.odm-ref {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
}

@media (max-width: 640px) {
    .odm-actions {
        flex-direction: column;
    }
    .odm-info {
        flex-wrap: wrap;
    }
}
</style>

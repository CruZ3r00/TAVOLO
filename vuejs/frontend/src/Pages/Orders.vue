<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import OrdersTableGrid from '@/components/OrdersTableGrid.vue';
import KitchenBoard from '@/components/KitchenBoard.vue';
import OrderDetailModal from '@/components/OrderDetailModal.vue';
import AddItemModal from '@/components/AddItemModal.vue';
import CheckoutModal from '@/components/CheckoutModal.vue';
import Skeleton from '@/components/Skeleton.vue';
import {
  fetchTables, fetchOrders, closeOrder,
  addOrderItem, updateItemStatus, orderErrorMessage,
} from '@/utils';

const store = useStore();
const route = useRoute();
const token = computed(() => store.getters.getToken);

const POLL_INTERVAL_MS = 20000;

const tables = ref([]);
const orders = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const errorMessage = ref('');
const toast = ref(null);

const mode = computed(() => (route.meta?.ordersMode === 'cucina' ? 'cucina' : 'cameriere'));

const showOrderDetail = ref(false);
const currentOrderDocId = ref(null);
const showAddItem = ref(false);
const addItemOrderDocId = ref(null);
const addItemLockVersion = ref(0);
const showCheckout = ref(false);
const checkoutOrder = ref(null);
const busyItemIds = ref(new Set());

const orderDetailRef = ref(null);

const stats = computed(() => {
  const activeOrders = orders.value.filter(o => o.status === 'active');
  const occupied = tables.value.filter(t => t.status === 'occupied').length;
  const free = tables.value.filter(t => t.status !== 'occupied' && t.status !== 'reserved').length;
  let readyTables = 0;
  for (const o of activeOrders) {
    if (o.items?.some(i => i.status === 'ready')) readyTables += 1;
  }
  return { occupied, free, total: tables.value.length, readyTables };
});

const kitchenStats = computed(() => {
  let total = 0;
  let ready = 0;
  for (const o of orders.value) {
    if (o.status !== 'active' || !o.items) continue;
    for (const it of o.items) {
      if (it.status === 'served') continue;
      total += 1;
      if (it.status === 'ready') ready += 1;
    }
  }
  return { total, ready };
});

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

const showToast = (type, message) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3500);
};

const handleViewOrder = (order) => {
  if (!order?.documentId) return;
  currentOrderDocId.value = order.documentId;
  showOrderDetail.value = true;
};

const onOrderUpdated = async () => { await loadData({ silent: true }); };

const onOpenAddItem = ({ orderDocumentId, lockVersion }) => {
  addItemOrderDocId.value = orderDocumentId;
  addItemLockVersion.value = lockVersion;
  showAddItem.value = true;
};

const onAddItem = async (payload) => {
  try {
    await addOrderItem(addItemOrderDocId.value, payload, token.value);
    showAddItem.value = false;
    if (orderDetailRef.value) await orderDetailRef.value.onItemAdded();
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

const handleKitchenAdvance = async ({ item, next, orderDocumentId }) => {
  const s = new Set(busyItemIds.value);
  s.add(item.documentId);
  busyItemIds.value = s;

  const orderIdx = orders.value.findIndex(o => o.documentId === orderDocumentId);
  let oldStatus = item.status;
  if (orderIdx !== -1) {
    const itemInOrder = orders.value[orderIdx].items?.find(i => i.documentId === item.documentId);
    if (itemInOrder) { oldStatus = itemInOrder.status; itemInOrder.status = next; }
  }
  try {
    await updateItemStatus(orderDocumentId, item.documentId, next, token.value);
    showToast('success', `"${item.name}" → ${statusLabel(next)}`);
  } catch (err) {
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

let pollHandle = null;
const startPolling = () => {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    if (document.visibilityState === 'visible') loadData({ silent: true });
  }, POLL_INTERVAL_MS);
};
const stopPolling = () => { if (pollHandle) { clearInterval(pollHandle); pollHandle = null; } };
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') loadData({ silent: true });
};

const openOrderFromQuery = () => {
  const docId = typeof route.query?.order === 'string' ? route.query.order : null;
  if (!docId) return;
  currentOrderDocId.value = docId;
  showOrderDetail.value = true;
};

onMounted(async () => {
  document.title = mode.value === 'cucina' ? 'Cucina · Tavolo' : 'Sala · Tavolo';
  await loadData();
  startPolling();
  document.addEventListener('visibilitychange', onVisibilityChange);
  openOrderFromQuery();
});

onBeforeUnmount(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

const now = computed(() => {
  const d = new Date();
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
});
</script>

<template>
  <AppLayout :page-title="mode === 'cucina' ? 'Cucina' : 'Sala'">
    <div class="md-main" :class="{ 'kt-main': mode === 'cucina' }">
      <header class="md-top">
        <div>
          <div class="overline">
            {{ mode === 'cucina' ? 'Cucina' : 'Sala' }} · {{ now }}
          </div>
          <h1>{{ mode === 'cucina' ? 'Comande in corso' : 'Sala & tavoli' }}</h1>
          <p v-if="mode === 'cameriere'">
            {{ stats.occupied }} occupati su {{ stats.total }} · {{ stats.free }} liberi
            <span v-if="stats.readyTables > 0"> · <strong style="color: var(--ok);">{{ stats.readyTables }} da chiudere</strong></span>
          </p>
          <p v-else>
            {{ kitchenStats.total }} portate attive · {{ kitchenStats.ready }} pronte da uscire
          </p>
        </div>
        <div class="md-top-tools">
          <button
            type="button"
            class="btn btn-sm"
            @click="loadData({ silent: true })"
            :disabled="loading || refreshing"
            aria-label="Aggiorna"
          >
            <span v-if="refreshing" class="spin-icon"></span>
            <i v-else class="bi bi-arrow-clockwise"></i>
            <span>{{ refreshing ? 'Aggiornamento…' : 'Aggiorna' }}</span>
          </button>
        </div>
      </header>

      <Transition name="fade">
        <div v-if="errorMessage" class="md-card" style="border-color: var(--danger); background: var(--danger-bg); padding: 12px 16px; color: var(--danger);">
          <i class="bi bi-exclamation-circle"></i>
          {{ errorMessage }}
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="toast" :class="['md-toast', `md-toast-${toast.type}`]" role="status">
          <i :class="['bi', toast.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle']"></i>
          <span>{{ toast.message }}</span>
        </div>
      </Transition>

      <!-- Skeleton loaders -->
      <div v-if="loading && tables.length === 0 && orders.length === 0">
        <div v-if="mode === 'cameriere'" class="ord-skel-grid">
          <div v-for="n in 8" :key="`sk-tbl-${n}`" class="ord-skel-card">
            <Skeleton width="40%" height="22px" />
            <Skeleton width="60%" height="11px" style="margin-top: 8px;" />
            <Skeleton width="100%" height="40px" radius="8px" style="margin-top: 12px;" />
          </div>
        </div>
        <div v-else class="ord-skel-kitchen">
          <div v-for="col in 3" :key="`sk-kc-${col}`" class="ord-skel-kt-col">
            <Skeleton width="50%" height="14px" />
            <div v-for="n in 3" :key="`sk-ki-${col}-${n}`" class="ord-skel-kt-card">
              <Skeleton width="60%" height="14px" />
              <Skeleton width="80%" height="11px" style="margin-top: 6px;" />
              <Skeleton width="100%" height="40px" radius="8px" style="margin-top: 12px;" />
            </div>
          </div>
        </div>
      </div>

      <template v-else>
        <OrdersTableGrid
          v-if="mode === 'cameriere'"
          :tables="tables"
          :orders="orders"
          @view-order="handleViewOrder"
        />
        <KitchenBoard
          v-else
          :orders="orders"
          :busy-item-ids="busyItemIds"
          @advance="handleKitchenAdvance"
        />
      </template>
    </div>

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
  </AppLayout>
</template>

<style scoped>
.md-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 56px 16px;
  color: var(--ink-3); font-size: 14px;
}
.spin-icon {
  width: 16px; height: 16px;
  border: 2px solid color-mix(in oklab, var(--ink) 18%, transparent);
  border-top-color: var(--ink);
  border-radius: 50%;
  display: inline-block;
  animation: spin-rotate 700ms linear infinite;
}
@keyframes spin-rotate { to { transform: rotate(360deg); } }

.md-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  background: var(--paper);
  border: 1px solid var(--line);
  font-size: 13.5px;
  font-weight: 500;
  max-width: 420px;
}
.md-toast i { font-size: 16px; flex-shrink: 0; }
.md-toast-success { background: color-mix(in oklab, var(--ok) 10%, var(--paper)); color: var(--ok-ink); border-color: color-mix(in oklab, var(--ok) 30%, transparent); }
.md-toast-error { background: color-mix(in oklab, var(--danger) 10%, var(--paper)); color: var(--danger); border-color: color-mix(in oklab, var(--danger) 30%, transparent); }

.ord-skel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.ord-skel-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
}
.ord-skel-kitchen {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.ord-skel-kt-col {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.ord-skel-kt-card {
  background: var(--bg-sunk, var(--bg-2));
  border-radius: 8px;
  padding: 12px;
}
@media (max-width: 1199px) {
  .ord-skel-kitchen { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .ord-skel-kitchen { grid-template-columns: 1fr; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 860px) {
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
}
</style>

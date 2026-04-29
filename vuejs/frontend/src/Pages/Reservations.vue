<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import ReservationCard from '@/components/ReservationCard.vue';
import OccupiedOrderCard from '@/components/OccupiedOrderCard.vue';
import ReservationCreateModal from '@/components/ReservationCreateModal.vue';
import SeatReservationModal from '@/components/SeatReservationModal.vue';
import WalkinModal from '@/components/WalkinModal.vue';
import TableManagerModal from '@/components/TableManagerModal.vue';
import OrderDetailModal from '@/components/OrderDetailModal.vue';
import AddItemModal from '@/components/AddItemModal.vue';
import CheckoutModal from '@/components/CheckoutModal.vue';
import Skeleton from '@/components/Skeleton.vue';
import {
  fetchReservations,
  updateReservationStatus,
  reservationErrorMessage,
  fetchOrders,
  fetchTables,
  closeOrder,
  addOrderItem,
  orderErrorMessage,
} from '@/utils';

const store = useStore();
const router = useRouter();
const token = computed(() => store.getters.getToken);

const POLL_INTERVAL_MS = 20000;

const reservations = ref([]);
const activeOrders = ref([]);
const tables = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const errorMessage = ref('');
const toast = ref(null);
const busyIds = ref(new Set());

const showCreateModal = ref(false);
const showSeatModal = ref(false);
const seatTargetReservation = ref(null);
const showWalkinModal = ref(false);
const showTableManager = ref(false);

const showOrderDetail = ref(false);
const currentOrderDocId = ref(null);
const showAddItem = ref(false);
const addItemOrderDocId = ref(null);
const addItemLockVersion = ref(0);
const showCheckout = ref(false);
const checkoutOrder = ref(null);
const orderDetailRef = ref(null);

const activeTab = ref('pending'); // mobile single-column view
const fromDate = ref(todayISO());

function todayISO() { return new Date().toISOString().slice(0, 10); }

const buildParams = () => {
  const params = {
    pageSize: 100,
    sort: 'datetime:asc',
    status: 'pending,confirmed,at_restaurant',
  };
  if (fromDate.value) {
    params.from = new Date(`${fromDate.value}T00:00:00`).toISOString();
  }
  return params;
};

const loadData = async ({ silent = false } = {}) => {
  if (!token.value) return;
  if (silent) refreshing.value = true; else loading.value = true;
  try {
    const [resvResp, ordersResp, tablesResp] = await Promise.all([
      fetchReservations(buildParams(), token.value),
      fetchOrders({ status: 'active', linked_reservation: true, pageSize: 100 }, token.value)
        .catch((err) => ({ __err: orderErrorMessage(err) })),
      fetchTables(token.value).catch(() => ({ data: [] })),
    ]);
    reservations.value = Array.isArray(resvResp?.data) ? resvResp.data : [];
    if (ordersResp && !ordersResp.__err) {
      activeOrders.value = Array.isArray(ordersResp.data) ? ordersResp.data : [];
      errorMessage.value = '';
    } else {
      activeOrders.value = [];
      errorMessage.value = ordersResp?.__err || '';
    }
    tables.value = Array.isArray(tablesResp?.data) ? tablesResp.data : [];
  } catch (err) {
    errorMessage.value = reservationErrorMessage(err);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

const byStatus = (s) => reservations.value.filter(r => r.status === s);
const pendingList = computed(() => byStatus('pending'));
const confirmedList = computed(() => byStatus('confirmed'));
const atRestaurantList = computed(() => byStatus('at_restaurant'));

const reservationIdsWithOrder = computed(() => {
  const set = new Set();
  for (const o of activeOrders.value) {
    const rid = o?.reservation?.documentId;
    if (rid) set.add(rid);
  }
  return set;
});
const orphanReservations = computed(() =>
  atRestaurantList.value.filter(r => !reservationIdsWithOrder.value.has(r.documentId))
);
const occupiedOrders = computed(() => {
  const list = Array.isArray(activeOrders.value) ? [...activeOrders.value] : [];
  list.sort((a, b) => (new Date(b?.opened_at || 0)).getTime() - (new Date(a?.opened_at || 0)).getTime());
  return list;
});
const occupiedTotalCount = computed(() => orphanReservations.value.length + occupiedOrders.value.length);

// Week strip data — last 3 days, today, next 3 days
const weekDays = computed(() => {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = -3; i <= 3; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('it-IT', { weekday: 'short' }).slice(0, 3);
    const num = String(d.getDate()).padStart(2, '0');
    const count = reservations.value.filter(r => (r.date || '').slice(0, 10) === iso).length;
    out.push({ iso, dayName, num, count, isToday: i === 0 });
  }
  return out;
});

const showToast = (type, message) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3500);
};

const handleAction = async ({ documentId, next }) => {
  if (!documentId || !next) return;
  busyIds.value = new Set([...busyIds.value, documentId]);
  try {
    const updated = await updateReservationStatus(documentId, next, token.value);
    const idx = reservations.value.findIndex(r => r.documentId === documentId);
    if (idx !== -1 && updated) {
      reservations.value.splice(idx, 1, { ...reservations.value[idx], ...updated });
    }
    showToast('success', transitionToast(next));
    if (next === 'cancelled' || next === 'completed') {
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
    case 'completed': return 'Prenotazione completata.';
    case 'cancelled': return 'Prenotazione annullata.';
    default: return 'Aggiornamento effettuato.';
  }
};

const handleSeatIntent = (r) => { seatTargetReservation.value = r; showSeatModal.value = true; };
const onSeated = async () => { showToast('success', 'Cliente accomodato.'); await loadData({ silent: true }); };
const onWalkinCreated = async () => { showToast('success', 'Walk-in registrato.'); await loadData({ silent: true }); };
const onTableManagerUpdated = async () => { await loadData({ silent: true }); };
const handleOpenOrder = (order) => {
  if (!order?.documentId) return;
  currentOrderDocId.value = order.documentId;
  showOrderDetail.value = true;
};
const handleCheckout = (order) => { checkoutOrder.value = order; showCheckout.value = true; };
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
const onCreated = (created) => {
  if (created && created.documentId) {
    reservations.value = [...reservations.value, created].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }
  showToast('success', 'Prenotazione creata.');
};

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

onMounted(() => {
  nextTick(() => { document.title = 'Prenotazioni · Tavolo'; });
  loadData();
  startPolling();
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onBeforeUnmount(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

const goDate = (iso) => {
  fromDate.value = iso;
  loadData();
};
</script>

<template>
  <AppLayout page-title="Prenotazioni">
    <div class="md-main">
      <header class="md-top">
        <div>
          <div class="overline">Prenotazioni · oggi</div>
          <h1>Prenotazioni</h1>
          <p>
            <span v-if="pendingList.length"><strong>{{ pendingList.length }} in attesa</strong> · </span>
            {{ confirmedList.length }} confermate · {{ occupiedTotalCount }} in sala
          </p>
        </div>
        <div class="md-top-tools">
          <input type="date" v-model="fromDate" class="md-date-input" @change="loadData()" aria-label="Mostra dal giorno" />
          <button type="button" class="btn btn-sm" @click="loadData({ silent: true })" :disabled="loading || refreshing">
            <span v-if="refreshing" class="spin-icon"></span>
            <i v-else class="bi bi-arrow-clockwise"></i>
            <span>Aggiorna</span>
          </button>
          <button type="button" class="btn btn-sm" @click="showTableManager = true">
            <i class="bi bi-grid-3x3-gap"></i><span>Tavoli</span>
          </button>
          <button type="button" class="btn btn-sm" @click="showWalkinModal = true">
            <i class="bi bi-person-plus"></i><span>Walk-in</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" @click="showCreateModal = true">
            <i class="bi bi-plus-lg"></i><span>Nuova prenotazione</span>
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

      <!-- Week strip -->
      <div class="kr-week">
        <button
          v-for="d in weekDays"
          :key="d.iso"
          type="button"
          class="kr-week-day"
          :class="{ today: d.isToday, empty: d.count === 0, active: fromDate === d.iso }"
          @click="goDate(d.iso)"
        >
          <span class="kr-week-name">{{ d.dayName }}</span>
          <span class="kr-week-num">{{ d.num }}</span>
          <span class="kr-week-c">{{ d.count > 0 ? `${d.count} pers.` : '— libero' }}</span>
        </button>
      </div>

      <!-- Mobile tabs -->
      <div class="kr-tabs res-mobile-tabs">
        <button
          type="button"
          class="kr-tab"
          :class="{ active: activeTab === 'pending' }"
          @click="activeTab = 'pending'"
        >
          <i class="bi bi-hourglass-split"></i>
          Richieste
          <span class="kr-tab-count">{{ pendingList.length }}</span>
        </button>
        <button
          type="button"
          class="kr-tab"
          :class="{ active: activeTab === 'confirmed' }"
          @click="activeTab = 'confirmed'"
        >
          <i class="bi bi-check2-circle"></i>
          Confermate
          <span class="kr-tab-count">{{ confirmedList.length }}</span>
        </button>
        <button
          type="button"
          class="kr-tab"
          :class="{ active: activeTab === 'at_restaurant' }"
          @click="activeTab = 'at_restaurant'"
        >
          <i class="bi bi-people"></i>
          In sala
          <span class="kr-tab-count">{{ occupiedTotalCount }}</span>
        </button>
      </div>

      <!-- Skeleton during initial load -->
      <div v-if="loading && reservations.length === 0" class="kr-kanban res-kanban-desktop">
        <section v-for="col in 3" :key="`sk-col-${col}`" class="kr-col">
          <header class="kr-col-h">
            <Skeleton width="120px" height="14px" />
            <Skeleton width="24px" height="14px" />
          </header>
          <div class="kr-col-list">
            <div v-for="n in 3" :key="`sk-${col}-${n}`" class="res-skel-card">
              <Skeleton width="55%" height="14px" />
              <Skeleton width="35%" height="11px" style="margin-top: 6px;" />
              <Skeleton width="100%" height="48px" radius="8px" style="margin-top: 12px;" />
              <Skeleton width="80%" height="12px" style="margin-top: 10px;" />
            </div>
          </div>
        </section>
      </div>

      <!-- Desktop kanban -->
      <div v-else class="kr-kanban res-kanban-desktop">
        <!-- Richieste -->
        <section class="kr-col">
          <header class="kr-col-h">
            <span><i class="bi bi-hourglass-split"></i> IN ATTESA</span>
            <span class="kr-col-c">{{ pendingList.length }}</span>
          </header>
          <div v-if="pendingList.length" class="kr-col-list">
            <ReservationCard
              v-for="r in pendingList"
              :key="r.documentId"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-inbox"></i>
            <span>Nessuna richiesta in attesa</span>
          </div>
        </section>

        <!-- Confermate -->
        <section class="kr-col">
          <header class="kr-col-h">
            <span><i class="bi bi-check2-circle"></i> CONFERMATE</span>
            <span class="kr-col-c">{{ confirmedList.length }}</span>
          </header>
          <div v-if="confirmedList.length" class="kr-col-list">
            <ReservationCard
              v-for="r in confirmedList"
              :key="r.documentId"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-calendar-x"></i>
            <span>Nessuna prenotazione confermata</span>
          </div>
        </section>

        <!-- In sala -->
        <section class="kr-col">
          <header class="kr-col-h">
            <span><i class="bi bi-people"></i> IN SALA</span>
            <span class="kr-col-c">{{ occupiedTotalCount }}</span>
          </header>
          <div v-if="occupiedTotalCount" class="kr-col-list">
            <OccupiedOrderCard
              v-for="o in occupiedOrders"
              :key="`ord-${o.documentId}`"
              :order="o"
              @open="handleOpenOrder"
              @checkout="handleCheckout"
            />
            <ReservationCard
              v-for="r in orphanReservations"
              :key="`resv-${r.documentId}`"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-door-open"></i>
            <span>Nessun tavolo in servizio</span>
          </div>
        </section>
      </div>

      <!-- Mobile single column -->
      <div v-if="!loading" class="res-mobile-view">
        <template v-if="activeTab === 'pending'">
          <div v-if="pendingList.length" class="kr-col-list">
            <ReservationCard
              v-for="r in pendingList"
              :key="`m-pending-${r.documentId}`"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-inbox"></i>
            <span>Nessuna richiesta in attesa</span>
          </div>
        </template>
        <template v-else-if="activeTab === 'confirmed'">
          <div v-if="confirmedList.length" class="kr-col-list">
            <ReservationCard
              v-for="r in confirmedList"
              :key="`m-conf-${r.documentId}`"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-calendar-x"></i>
            <span>Nessuna prenotazione confermata</span>
          </div>
        </template>
        <template v-else>
          <div v-if="occupiedTotalCount" class="kr-col-list">
            <OccupiedOrderCard
              v-for="o in occupiedOrders"
              :key="`m-ord-${o.documentId}`"
              :order="o"
              @open="handleOpenOrder"
              @checkout="handleCheckout"
            />
            <ReservationCard
              v-for="r in orphanReservations"
              :key="`m-orph-${r.documentId}`"
              :reservation="r"
              :busy="busyIds.has(r.documentId)"
              @action="handleAction"
              @seat="handleSeatIntent"
            />
          </div>
          <div v-else class="kr-col-empty">
            <i class="bi bi-door-open"></i>
            <span>Nessun tavolo in servizio</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Modals -->
    <ReservationCreateModal :show="showCreateModal" :token="token" @close="showCreateModal = false" @created="onCreated" />
    <SeatReservationModal :show="showSeatModal" :reservation="seatTargetReservation" :tables="tables" :token="token" @close="showSeatModal = false" @seated="onSeated" />
    <WalkinModal :show="showWalkinModal" :tables="tables" :token="token" @close="showWalkinModal = false" @created="onWalkinCreated" />
    <TableManagerModal :show="showTableManager" :token="token" :tables="tables" :editing-table="null" @close="showTableManager = false" @updated="onTableManagerUpdated" />
    <OrderDetailModal ref="orderDetailRef" :show="showOrderDetail" :order-document-id="currentOrderDocId" :token="token" @close="showOrderDetail = false" @order-updated="onOrderUpdated" @open-add-item="onOpenAddItem" @open-checkout="(o) => { checkoutOrder = o; showCheckout = true; }" />
    <AddItemModal :show="showAddItem" :order-document-id="addItemOrderDocId" :lock-version="addItemLockVersion" @close="showAddItem = false" @add="onAddItem" />
    <CheckoutModal :show="showCheckout" :order="checkoutOrder" @close="showCheckout = false" @confirm="onConfirmCheckout" />
  </AppLayout>
</template>

<style scoped>
.md-date-input {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--paper);
  font-family: var(--f-sans);
  font-size: 12.5px;
  color: var(--ink);
  cursor: pointer;
}
.md-date-input:focus { outline: none; border-color: var(--ac); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 18%, transparent); }

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

.kr-col-list {
  display: flex; flex-direction: column; gap: 10px;
}

.md-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 300;
  display: flex; align-items: center; gap: 10px;
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

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

.res-skel-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
}

/* Show kanban on desktop, single-col tabs on mobile */
.res-mobile-tabs { display: none; }
.res-mobile-view { display: none; }

@media (max-width: 860px) {
  .res-kanban-desktop { display: none; }
  .res-mobile-tabs { display: flex; }
  .res-mobile-view { display: block; }
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
  .md-top-tools { width: 100%; }
}
</style>

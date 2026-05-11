<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import OrdersTableGrid from '@/components/OrdersTableGrid.vue';
import KitchenBoard from '@/components/KitchenBoard.vue';
import OrderDetailModal from '@/components/OrderDetailModal.vue';
import AddItemModal from '@/components/AddItemModal.vue';
import CheckoutModal from '@/components/CheckoutModal.vue';
import Modal from '@/components/Modal.vue';
import Skeleton from '@/components/Skeleton.vue';
import { isSupabaseRealtimeConfigured, supabase } from '@/supabase';
import { STAFF_ROLES, effectiveUserId, staffRole } from '@/staffAccess';
import {
  fetchTables, fetchOrders, closeOrder,
  addOrderItem, updateItemStatus, orderErrorMessage,
  pickupTakeaway,
  createWalkin, reservationErrorMessage,
} from '@/utils';

const store = useStore();
const route = useRoute();
const router = useRouter();
const token = computed(() => store.getters.getToken);
const currentUser = computed(() => store.getters.getUser || null);
const isOwnerView = computed(() => staffRole(currentUser.value) === STAFF_ROLES.OWNER);

const tables = ref([]);
const orders = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const errorMessage = ref('');
const toast = ref(null);

const kitchenModes = {
  cucina: { title: 'Cucina', overline: 'Cucina', station: 'cucina' },
  bar: { title: 'Bar', overline: 'Bar', station: 'bar' },
  pizzeria: { title: 'Pizzeria', overline: 'Pizzeria', station: 'pizzeria' },
  cucina_sg: { title: 'Cucina SG', overline: 'Senza glutine', station: 'cucina_sg' },
};
const ownerOrderTabs = [
  { mode: 'cucina', label: 'Cucina', icon: 'bi-fire', path: '/kitchen' },
  { mode: 'bar', label: 'Bar', icon: 'bi-cup-straw', path: '/bar' },
  { mode: 'pizzeria', label: 'Pizzeria', icon: 'bi-record-circle', path: '/pizzeria' },
  { mode: 'cucina_sg', label: 'Cucina SG', icon: 'bi-shield-check', path: '/kitchen-sg' },
];
const mode = computed(() => (route.meta?.ordersMode && kitchenModes[route.meta.ordersMode] ? route.meta.ordersMode : 'cameriere'));
const isKitchenMode = computed(() => mode.value !== 'cameriere');
const modeInfo = computed(() => kitchenModes[mode.value] || { title: 'Sala', overline: 'Sala', station: null });
const isOwnerProductionMode = computed(() => isOwnerView.value && isKitchenMode.value);
const isPro = computed(() => currentUser.value?.subscription_plan === 'pro');

// Owner monitor: department pill bar (Tutti/Cucina/Bar/Pizzeria/Cucina SG)
const initialMonitorDept = (() => {
  const m = route.meta?.ordersMode;
  return m && ['cucina', 'bar', 'pizzeria', 'cucina_sg'].includes(m) ? m : 'all';
})();
const monitorDept = ref(initialMonitorDept);
const COURSE_LABELS = { 1: 'Prima portata', 2: 'Seconda portata', 3: 'Terza portata', 4: 'Altro' };
const ROLE_LABELS = { cucina: 'Cucina', bar: 'Bar', pizzeria: 'Pizzeria', cucina_sg: 'Cucina SG' };
const ROLE_ICONS = { cucina: 'bi-fire', bar: 'bi-cup-straw', pizzeria: 'bi-record-circle', cucina_sg: 'bi-shield-check' };

const departmentPills = computed(() => ([
  { key: 'all',       label: 'Tutti',     icon: 'bi-grid-3x3-gap', allowed: true },
  { key: 'cucina',    label: 'Cucina',    icon: 'bi-fire',          allowed: true },
  { key: 'bar',       label: 'Bar',       icon: 'bi-cup-straw',     allowed: isPro.value },
  { key: 'pizzeria',  label: 'Pizzeria',  icon: 'bi-record-circle', allowed: isPro.value },
  { key: 'cucina_sg', label: 'Cucina SG', icon: 'bi-shield-check',  allowed: isPro.value },
]));

const stationFromMonitor = computed(() => (monitorDept.value === 'all' ? null : monitorDept.value));
const effectiveStation = computed(() => (
  isOwnerProductionMode.value ? stationFromMonitor.value : modeInfo.value.station
));

const pageTitle = computed(() => (isOwnerProductionMode.value ? 'Ordini' : modeInfo.value.title));
const headerTitle = computed(() => {
  if (isOwnerProductionMode.value) return 'Ordini in tempo reale';
  return isKitchenMode.value ? 'Comande in corso' : 'Sala & tavoli';
});
const headerOverline = computed(() => {
  if (isOwnerProductionMode.value) {
    return `Monitoraggio operativo · live · ${now.value}`;
  }
  return `${modeInfo.value.overline} · ${now.value}`;
});

const showOrderDetail = ref(false);
const currentOrderDocId = ref(null);
const showAddItem = ref(false);
const addItemOrderDocId = ref(null);
const addItemLockVersion = ref(0);
const showCheckout = ref(false);
const checkoutOrder = ref(null);
const busyItemIds = ref(new Set());
const showWalkin = ref(false);
const walkinTable = ref(null);
const walkinSaving = ref(false);
const walkinForm = ref({ number_of_people: 2, customer_name: 'Walk-in', phone: '', notes: '' });
const walkinErrors = ref({});

const orderDetailRef = ref(null);

const stats = computed(() => {
  const tableOrders = orders.value.filter(o => o.service_type !== 'takeaway');
  const activeOrders = tableOrders.filter(o => o.status === 'active');
  const occupied = tables.value.filter(t => t.status === 'occupied').length;
  const free = tables.value.filter(t => t.status !== 'occupied' && t.status !== 'reserved').length;
  let readyTables = 0;
  for (const o of activeOrders) {
    if (o.items?.some(i => i.status === 'ready')) readyTables += 1;
  }
  return { occupied, free, total: tables.value.length, readyTables };
});
const readyTakeaways = computed(() => orders.value
  .filter(o => o.service_type === 'takeaway' && o.status === 'active' && o.takeaway_status === 'ready')
  .sort((a, b) => new Date(a.pickup_at || 0) - new Date(b.pickup_at || 0)));

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

// ===== Monitor view (owner) =====
const itemStation = (item) => {
  if (!item) return null;
  return item.station || item.fk_element?.staff_role || null;
};
const itemCourse = (item) => {
  const c = parseInt(item?.course, 10);
  return Number.isFinite(c) && c >= 1 ? c : 1;
};
const formatElapsed = (ts) => {
  if (!ts) return '0\'';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '0\'';
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  return `${m}'`;
};
const orderTopStatus = (order) => {
  const items = (order.items || []).filter(i => i.status !== 'served' && i.status !== 'cancelled');
  if (items.length === 0) return 'consegnato';
  if (items.every(i => i.status === 'ready')) return 'pronto';
  if (items.some(i => i.status === 'preparing' || i.status === 'taken')) return 'lavorazione';
  return 'lavorazione';
};
const filteredMonitorOrders = computed(() => {
  const dept = monitorDept.value;
  return orders.value
    .filter(o => o.status === 'active' && Array.isArray(o.items))
    .map(o => {
      const items = dept === 'all' ? o.items : o.items.filter(i => itemStation(i) === dept);
      return { ...o, items };
    })
    .filter(o => o.items.length > 0)
    .map(o => ({
      ...o,
      _topStatus: orderTopStatus(o),
      _grouped: o.items.reduce((acc, it) => {
        const c = itemCourse(it);
        (acc[c] = acc[c] || []).push(it);
        return acc;
      }, {}),
    }))
    .sort((a, b) => new Date(b.opened_at || b.createdAt || 0) - new Date(a.opened_at || a.createdAt || 0));
});
const monitorStats = computed(() => {
  const list = filteredMonitorOrders.value;
  let inLav = 0, pronti = 0, consegnati = 0;
  list.forEach(o => {
    if (o._topStatus === 'lavorazione') inLav += 1;
    else if (o._topStatus === 'pronto') pronti += 1;
    else if (o._topStatus === 'consegnato') consegnati += 1;
  });
  return { total: list.length, inLav, pronti, consegnati };
});
const monitorActiveTitle = computed(() => (
  monitorDept.value === 'all' ? 'Tutti i reparti' : (ROLE_LABELS[monitorDept.value] || 'Reparto')
));
const monitorActiveIcon = computed(() => (
  monitorDept.value === 'all' ? 'bi-grid-3x3-gap' : (ROLE_ICONS[monitorDept.value] || 'bi-grid-3x3-gap')
));
const tableNumber = (order) => order?.table?.number ?? order?.fk_table?.number ?? order?.table_number ?? '?';
const takeawayDailyNumbers = computed(() => {
  const map = new Map();
  const sameDay = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  };
  const list = (orders.value || [])
    .filter(o => o?.service_type === 'takeaway' && sameDay(o.opened_at))
    .sort((a, b) => new Date(a.opened_at || 0) - new Date(b.opened_at || 0));
  list.forEach((o, i) => map.set(o.documentId, i + 1));
  return map;
});
const takeawayDailyNumber = (order) => takeawayDailyNumbers.value.get(order?.documentId) ?? '?';
const orderPill = (order) => order?.service_type === 'takeaway' ? `A${takeawayDailyNumber(order)}` : `T${tableNumber(order)}`;
const orderTitle = (order) => order?.service_type === 'takeaway'
  ? `Asporto · ${order.customer_name || 'Cliente'}`
  : `Tavolo ${tableNumber(order)}`;
const setMonitorDept = (key, allowed) => {
  if (!allowed) return;
  monitorDept.value = key;
  loadData({ silent: true });
};

const filterOrdersForView = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  if (mode.value === 'cameriere') {
    return list.filter(o => o.service_type !== 'takeaway' || o.takeaway_status === 'ready');
  }
  if (isOwnerProductionMode.value && !effectiveStation.value) {
    return list.filter(o => (
      o.service_type !== 'takeaway'
      || ['sent_to_departments', 'ready'].includes(o.takeaway_status)
    ));
  }
  return list;
};

const loadData = async ({ silent = false } = {}) => {
  if (!token.value) return;
  if (silent) refreshing.value = true; else loading.value = true;
  try {
    const [tablesResp, ordersResp] = await Promise.all([
      isKitchenMode.value ? Promise.resolve({ data: [] }) : fetchTables(token.value),
      fetchOrders({ status: 'active', pageSize: 100, station: effectiveStation.value }, token.value),
    ]);
    tables.value = Array.isArray(tablesResp?.data) ? tablesResp.data : [];
    orders.value = filterOrdersForView(ordersResp?.data);
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

const handleOpenTable = async (table) => {
  if (!table?.documentId || !token.value) return;
  walkinTable.value = table;
  walkinForm.value = {
    number_of_people: Math.max(1, Math.min(parseInt(table.seats, 10) || 2, 12)),
    customer_name: 'Walk-in',
    phone: '',
    notes: '',
  };
  walkinErrors.value = {};
  showWalkin.value = true;
};

const validateWalkin = () => {
  const errors = {};
  const people = parseInt(walkinForm.value.number_of_people, 10);
  if (!Number.isFinite(people) || people < 1 || people > 1000) {
    errors.number_of_people = 'Inserisci almeno 1 coperto.';
  }
  if (!String(walkinForm.value.customer_name || '').trim()) {
    errors.customer_name = 'Inserisci un nome.';
  }
  walkinErrors.value = errors;
  return Object.keys(errors).length === 0;
};

const confirmWalkin = async () => {
  if (!walkinTable.value?.documentId || !token.value || !validateWalkin()) return;
  walkinSaving.value = true;
  try {
    const result = await createWalkin({
      table_id: walkinTable.value.documentId,
      number_of_people: parseInt(walkinForm.value.number_of_people, 10),
      customer_name: String(walkinForm.value.customer_name || '').trim(),
      phone: String(walkinForm.value.phone || '').trim() || undefined,
      notes: String(walkinForm.value.notes || '').trim() || undefined,
    }, token.value);
    showWalkin.value = false;
    await loadData({ silent: true });
    if (result?.order?.documentId) {
      currentOrderDocId.value = result.order.documentId;
      showOrderDetail.value = true;
    }
    showToast('success', `Walk-in aperto al tavolo ${walkinTable.value.number}.`);
  } catch (err) {
    showToast('error', reservationErrorMessage(err));
    await loadData({ silent: true });
  } finally {
    walkinSaving.value = false;
  }
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
    if (result.queued) {
      showToast('success', `Richiesta inviata al dispositivo POS/RT. Rif: ${result.event_id || 'OK'}`);
    } else {
      showOrderDetail.value = false;
      currentOrderDocId.value = null;
      showToast('success', `Conto chiuso. Rif: ${result.payment?.transactionId || 'OK'}`);
    }
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
    await updateItemStatus(orderDocumentId, item.documentId, next, token.value, { station: modeInfo.value.station });
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

const handleTakeawayPickupFromSala = async (order) => {
  if (!order?.documentId) return;
  try {
    await pickupTakeaway(order.documentId, token.value);
    showToast('success', `Asporto ${order.customer_name || ''} ritirato dalla cucina.`);
    await loadData({ silent: true });
  } catch (err) {
    showToast('error', orderErrorMessage(err));
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

let realtimeChannel = null;
let realtimeRefreshHandle = null;

const scheduleRealtimeRefresh = () => {
  if (document.visibilityState !== 'visible') return;
  if (realtimeRefreshHandle) clearTimeout(realtimeRefreshHandle);
  realtimeRefreshHandle = setTimeout(() => {
    realtimeRefreshHandle = null;
    loadData({ silent: true });
  }, 250);
};

const stopRealtime = async () => {
  if (realtimeRefreshHandle) {
    clearTimeout(realtimeRefreshHandle);
    realtimeRefreshHandle = null;
  }
  if (realtimeChannel && supabase) {
    try {
      await supabase.removeChannel(realtimeChannel);
    } catch (_err) { /* realtime is optional */ }
    realtimeChannel = null;
  }
};

const subscribeRealtime = async (userId) => {
  await stopRealtime();
  if (!isSupabaseRealtimeConfigured || !supabase || !userId) return;

  try {
    realtimeChannel = supabase
      .channel(`kitchen-orders-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_realtime_events',
        filter: `user_id=eq.${userId}`,
      }, scheduleRealtimeRefresh);

    realtimeChannel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeChannel = null;
      }
    });
  } catch (_err) {
    realtimeChannel = null;
  }
};
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') loadData({ silent: true });
};

const openOrderFromQuery = () => {
  const docId = typeof route.query?.order === 'string' ? route.query.order : null;
  if (!docId) return;
  currentOrderDocId.value = docId;
  showOrderDetail.value = true;
};

const updateDocumentTitle = () => {
  document.title = `${pageTitle.value} · ComforTables`;
};

const switchOwnerOrderMode = (tab) => {
  if (!tab?.path || route.path === tab.path) return;
  router.push(tab.path);
};

onMounted(async () => {
  updateDocumentTitle();
  await loadData();
  await subscribeRealtime(effectiveUserId(store.getters.getUser));
  document.addEventListener('visibilitychange', onVisibilityChange);
  openOrderFromQuery();
});

onBeforeUnmount(() => {
  stopRealtime();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

const now = computed(() => {
  const d = new Date();
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
});

watch(() => route.path, async () => {
  updateDocumentTitle();
  if (isOwnerProductionMode.value) {
    const m = route.meta?.ordersMode;
    if (m && ['cucina', 'bar', 'pizzeria', 'cucina_sg'].includes(m)) {
      monitorDept.value = m;
    }
  }
  await loadData();
  openOrderFromQuery();
});
</script>

<template>
  <AppLayout :page-title="pageTitle">
    <div class="md-main" :class="{ 'kt-main': isKitchenMode }">
      <header class="md-top">
        <div>
          <div class="overline">{{ headerOverline }}</div>
          <h1>{{ headerTitle }}</h1>
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

      <!-- ===== OWNER · monitor toolbar ===== -->
      <div v-if="isOwnerProductionMode" class="ct-dept-bar" aria-label="Reparto monitorato">
        <button
          v-for="pill in departmentPills"
          :key="pill.key"
          type="button"
          class="ct-dept-pill"
          :class="{ active: monitorDept === pill.key }"
          :disabled="!pill.allowed"
          :title="pill.allowed ? '' : 'Disponibile con il piano Professionale'"
          @click="setMonitorDept(pill.key, pill.allowed)"
        >
          <i :class="['bi', pill.icon]" aria-hidden="true"></i>
          <span>{{ pill.label }}</span>
          <span v-if="!pill.allowed" class="lock-pill">PRO</span>
        </button>
        <span v-if="!isPro" class="ct-dept-bar__note">
          <i class="bi bi-info-circle" style="color: var(--ac);"></i>
          Piano Essenziale: solo Cucina
        </span>
      </div>

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
        <!-- ===== KPI strip + Monitor (owner) ===== -->
        <template v-if="isOwnerProductionMode">
          <div class="ct-stat-grid ct-stagger">
            <div class="ct-stat">
              <span class="ct-stat__ico"><i class="bi bi-receipt"></i></span>
              <div>
                <div class="ct-stat__label">Ordini attivi</div>
                <div class="ct-stat__value">{{ monitorStats.total }}</div>
              </div>
            </div>
            <div class="ct-stat ct-stat--warn">
              <span class="ct-stat__ico"><i class="bi bi-fire"></i></span>
              <div>
                <div class="ct-stat__label">In lavorazione</div>
                <div class="ct-stat__value">{{ monitorStats.inLav }}</div>
              </div>
            </div>
            <div class="ct-stat ct-stat--ok">
              <span class="ct-stat__ico"><i class="bi bi-bell"></i></span>
              <div>
                <div class="ct-stat__label">Pronti</div>
                <div class="ct-stat__value">{{ monitorStats.pronti }}</div>
              </div>
            </div>
            <div class="ct-stat ct-stat--muted">
              <span class="ct-stat__ico"><i class="bi bi-check2-circle"></i></span>
              <div>
                <div class="ct-stat__label">Consegnati</div>
                <div class="ct-stat__value">{{ monitorStats.consegnati }}</div>
              </div>
            </div>
          </div>

          <section class="ct-orders-section">
            <header class="ct-orders-section__head">
              <h2 class="ct-orders-section__title">
                <i :class="['bi', monitorActiveIcon]" aria-hidden="true"></i>
                {{ monitorActiveTitle }}
              </h2>
              <div class="ct-orders-live">
                <span class="live-dot" aria-hidden="true"></span>
                <span>Live · aggiornamento auto</span>
              </div>
            </header>

            <div class="ct-orders-grid ct-stagger">
              <article
                v-for="o in filteredMonitorOrders"
                :key="o.documentId || o.id"
                class="ct-order-card"
                @click="handleViewOrder(o)"
                role="button"
                tabindex="0"
                @keydown.enter="handleViewOrder(o)"
              >
                <header class="ct-order-card__head">
                  <span class="ct-order-card__pill" :class="{ takeaway: o.service_type === 'takeaway' }">{{ orderPill(o) }}</span>
                  <div class="ct-order-card__heading">
                    <div class="ct-order-card__title">{{ orderTitle(o) }}</div>
                    <div class="ct-order-card__meta">
                      <span><i class="bi bi-clock"></i> {{ formatElapsed(o.opened_at) }}</span>
                      <span v-if="o.covers">·</span>
                      <span v-if="o.covers">{{ o.covers }} cop.</span>
                    </div>
                  </div>
                  <span
                    class="chip"
                    :class="{
                      ok: o._topStatus === 'pronto',
                      warn: o._topStatus === 'lavorazione',
                    }"
                  >
                    <template v-if="o._topStatus === 'pronto'">Pronto</template>
                    <template v-else-if="o._topStatus === 'lavorazione'">In lavorazione</template>
                    <template v-else>Consegnato</template>
                  </span>
                </header>
                <div class="ct-order-card__body">
                  <div
                    v-for="(group, courseKey) in o._grouped"
                    :key="`c-${o.documentId || o.id}-${courseKey}`"
                    class="ct-order-course"
                  >
                    <div class="ct-order-course__label">
                      <span class="ct-order-course__label-dot"></span>
                      {{ COURSE_LABELS[courseKey] || `Portata ${courseKey}` }}
                    </div>
                    <ul class="ct-order-course__list">
                      <li
                        v-for="(it, idx) in group"
                        :key="`it-${o.documentId || o.id}-${courseKey}-${idx}`"
                        class="ct-order-course__item"
                      >
                        <span class="ct-order-course__qty">×{{ it.quantity || 1 }}</span>
                        <span class="ct-order-course__name">{{ it.name }}</span>
                        <span
                          v-if="monitorDept === 'all' && itemStation(it)"
                          class="ct-order-course__station"
                        >
                          {{ ROLE_LABELS[itemStation(it)] || itemStation(it) }}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </article>

              <div v-if="filteredMonitorOrders.length === 0" class="ct-orders-empty">
                <i class="bi bi-inbox"></i>
                Nessun ordine attivo per questo reparto.
              </div>
            </div>
          </section>
        </template>

        <!-- ===== Cameriere (sala) ===== -->
        <template v-else-if="mode === 'cameriere'">
          <section v-if="readyTakeaways.length" class="takeaway-ready-alert">
            <header>
              <i class="bi bi-bag-check"></i>
              <strong>Asporto pronto da ritirare</strong>
              <span>{{ readyTakeaways.length }}</span>
            </header>
            <div class="takeaway-ready-list">
              <article v-for="o in readyTakeaways" :key="o.documentId" class="takeaway-ready-row">
                <div>
                  <strong>{{ o.customer_name || 'Cliente' }}</strong>
                  <span>{{ o.customer_phone || 'Telefono non disponibile' }}</span>
                </div>
                <button type="button" class="ds-btn ds-btn-primary ds-btn-sm" @click="handleTakeawayPickupFromSala(o)">
                  <i class="bi bi-box-arrow-up"></i>
                  <span>Preso dalla cucina</span>
                </button>
              </article>
            </div>
          </section>
          <OrdersTableGrid
            :tables="tables"
            :orders="orders"
            @view-order="handleViewOrder"
            @open-table="handleOpenTable"
          />
        </template>

        <!-- ===== Staff cucina/bar/etc. — kanban ===== -->
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

    <Modal :show="showWalkin" slim @close="showWalkin = false">
      <template #title>
        <div class="walkin-title">
          <i class="bi bi-person-walking" aria-hidden="true"></i>
          <h2>Walk-in tavolo {{ walkinTable?.number }}</h2>
        </div>
      </template>
      <template #body>
        <form class="walkin-form" @submit.prevent="confirmWalkin">
          <div class="ds-field">
            <label class="ds-label" for="walkin-people">Coperti</label>
            <input
              id="walkin-people"
              v-model.number="walkinForm.number_of_people"
              class="ds-input"
              type="number"
              min="1"
              max="1000"
              inputmode="numeric"
            >
            <p v-if="walkinErrors.number_of_people" class="ds-helper walkin-err">{{ walkinErrors.number_of_people }}</p>
          </div>
          <div class="ds-field">
            <label class="ds-label" for="walkin-name">Nome</label>
            <input id="walkin-name" v-model="walkinForm.customer_name" class="ds-input" type="text" maxlength="120">
            <p v-if="walkinErrors.customer_name" class="ds-helper walkin-err">{{ walkinErrors.customer_name }}</p>
          </div>
          <div class="ds-field">
            <label class="ds-label" for="walkin-phone">Telefono</label>
            <input id="walkin-phone" v-model="walkinForm.phone" class="ds-input" type="tel" maxlength="32" placeholder="Opzionale">
          </div>
          <div class="ds-field">
            <label class="ds-label" for="walkin-notes">Note</label>
            <input id="walkin-notes" v-model="walkinForm.notes" class="ds-input" type="text" placeholder="Opzionale">
          </div>
          <div class="walkin-actions">
            <button type="button" class="ds-btn ds-btn-ghost" @click="showWalkin = false" :disabled="walkinSaving">
              Annulla
            </button>
            <button type="submit" class="ds-btn ds-btn-primary" :disabled="walkinSaving">
              <span v-if="walkinSaving" class="spin-icon"></span>
              <i v-else class="bi bi-door-open" aria-hidden="true"></i>
              Apri
            </button>
          </div>
        </form>
      </template>
    </Modal>
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
.walkin-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.walkin-title i {
  color: var(--ac);
  font-size: 18px;
}
.walkin-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.walkin-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.walkin-err {
  color: var(--danger);
  margin-top: 4px;
}
.walkin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}
@media (max-width: 1199px) {
  .ord-skel-kitchen { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .ord-skel-kitchen { grid-template-columns: 1fr; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

.ord-tabs {
  margin-top: -4px;
}
.ord-tabs .pf-tab {
  text-decoration: none;
}

.ct-order-card { cursor: pointer; }
.ct-order-card:focus-visible {
  outline: 2px solid var(--ac);
  outline-offset: 2px;
}
:deep(.ct-order-card__pill.takeaway) {
  background: color-mix(in oklab, var(--ac) 12%, var(--paper));
  color: var(--ac);
  border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
}
.takeaway-ready-alert {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in oklab, var(--ok) 35%, var(--line));
  border-radius: var(--r-md);
  background: color-mix(in oklab, var(--ok) 9%, var(--paper));
}
.takeaway-ready-alert header {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ok-ink, var(--ok));
}
.takeaway-ready-alert header span {
  min-width: 24px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  border-radius: var(--r-sm);
  background: var(--paper);
  border: 1px solid var(--line);
  font-weight: 800;
}
.takeaway-ready-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}
.takeaway-ready-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--paper);
}
.takeaway-ready-row strong,
.takeaway-ready-row span {
  display: block;
}
.takeaway-ready-row span {
  color: var(--ink-3);
  font-size: 12px;
}

@media (max-width: 860px) {
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
  .takeaway-ready-row { align-items: stretch; flex-direction: column; }
}
</style>

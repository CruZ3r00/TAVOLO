<script setup>
// Storico ordini chiusi (dine-in + takeaway), raggruppati per giorno.
// Sostituisce il vecchio BarShiftHistory: questo lista TUTTI gli ordini
// (non solo bevande). Sorgente dati: OrderArchive (snapshot immutabile).
//
// Layout:
//   - giorno (data + totali aggregati) → espandibile
//     - ogni ordine (tavolo N | asporto cliente) → click espande gli items
//
// Filtri: solo range giorni (default ultimi 30) e tipo servizio.
// Niente paginazione esposta nella UI (pageSize=200): per range maggiori
// l'utente puo' restringere il "da/a".

import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { fetchOrdersHistory } from '@/utils';

const props = defineProps({
  mode: { type: String, default: 'modal' }, // 'modal' | 'page'
});
const emit = defineEmits(['close']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const days = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const expandedDays = ref(new Set());
const expandedOrders = ref(new Set());

// Default range: ultimi 30 giorni in input date (YYYY-MM-DD locale).
function isoLocalDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
const today = new Date();
const initialFrom = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
const fromInput = ref(isoLocalDay(initialFrom));
const toInput = ref(isoLocalDay(today));
const serviceFilter = ref(''); // '' = tutti

const totalsAll = computed(() => {
  let revenue = 0;
  let orders = 0;
  let units = 0;
  for (const d of days.value) {
    revenue += Number(d.totals?.revenue) || 0;
    orders += Number(d.totals?.orders_count) || 0;
    units += Number(d.totals?.items_units) || 0;
  }
  return { revenue: Number(revenue.toFixed(2)), orders, units };
});

const formatDate = (yyyymmdd) => {
  if (!yyyymmdd || yyyymmdd === '—') return '—';
  const [y, m, d] = yyyymmdd.split('-');
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return yyyymmdd;
  return dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};
const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
};
const formatDuration = (mins) => {
  const m = Number(mins) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, '0')}m`;
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    // Costruisce ISO con tutto il giorno coperto (inclusivo).
    const fromIso = new Date(`${fromInput.value}T00:00:00`).toISOString();
    const toIso = new Date(`${toInput.value}T23:59:59.999`).toISOString();
    const resp = await fetchOrdersHistory(token.value, {
      from: fromIso,
      to: toIso,
      pageSize: 200,
      service_type: serviceFilter.value || undefined,
    });
    days.value = resp?.data?.days || [];
    total.value = resp?.meta?.total || 0;
    expandedDays.value = new Set(days.value.slice(0, 1).map((d) => d.date)); // espandi 1° giorno
  } catch (e) {
    error.value = (e && e.message) || 'Errore caricamento storico ordini.';
  } finally {
    loading.value = false;
  }
};

const toggleDay = (date) => {
  if (expandedDays.value.has(date)) expandedDays.value.delete(date);
  else expandedDays.value.add(date);
  expandedDays.value = new Set(expandedDays.value);
};
const toggleOrder = (orderKey) => {
  if (expandedOrders.value.has(orderKey)) expandedOrders.value.delete(orderKey);
  else expandedOrders.value.add(orderKey);
  expandedOrders.value = new Set(expandedOrders.value);
};

const orderLabel = (o) => {
  if (o.service_type === 'takeaway') {
    const who = o.customer_name || 'cliente';
    return `Asporto · ${who}`;
  }
  const table = o.table_number ? `T${o.table_number}` : 'Tavolo';
  const area = o.table_area ? ` (${o.table_area})` : '';
  return `${table}${area}`;
};

const orderSubtitle = (o) => {
  const parts = [];
  if (o.service_type === 'takeaway') {
    if (o.customer_phone) parts.push(o.customer_phone);
    if (o.pickup_at) parts.push(`Ritiro: ${formatDateTime(o.pickup_at)}`);
  } else {
    if (o.is_walkin) parts.push('Walk-in');
    if (o.covers) parts.push(`${o.covers} coperti`);
    if (o.opened_at) parts.push(`Apertura ${formatTime(o.opened_at)}`);
  }
  if (o.closed_at) parts.push(`Chiusura ${formatTime(o.closed_at)}`);
  if (o.duration_minutes) parts.push(`Durata ${formatDuration(o.duration_minutes)}`);
  return parts.join(' · ');
};

onMounted(() => load());
</script>

<template>
  <div class="oh-page" :class="{ 'oh-page--modal': mode === 'modal' }">
    <header class="oh-head">
      <div class="oh-head-info">
        <div class="overline">Gestionale · Storico</div>
        <h1>Storico ordini</h1>
        <p>
          Tutti gli ordini chiusi (dine-in e asporto), raggruppati per giorno.
          Clicca su un ordine per espandere le righe.
        </p>
      </div>
      <div class="oh-head-actions">
        <button
          v-if="mode === 'modal'"
          type="button"
          class="ds-btn ds-btn-ghost ds-btn-icon"
          aria-label="Chiudi"
          @click="emit('close')"
        >
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </header>

    <div class="ds-card oh-filters">
      <div class="oh-filter">
        <label class="ds-label">Da</label>
        <input type="date" class="ds-input" v-model="fromInput" :max="toInput" />
      </div>
      <div class="oh-filter">
        <label class="ds-label">A</label>
        <input type="date" class="ds-input" v-model="toInput" :min="fromInput" />
      </div>
      <div class="oh-filter">
        <label class="ds-label">Tipo</label>
        <select class="ds-input" v-model="serviceFilter">
          <option value="">Tutti</option>
          <option value="table">Solo dine-in</option>
          <option value="takeaway">Solo asporto</option>
        </select>
      </div>
      <div class="oh-filter oh-filter-actions">
        <button
          type="button"
          class="ds-btn ds-btn-primary"
          :disabled="loading"
          @click="load"
        >
          <i class="bi" :class="loading ? 'bi-arrow-repeat oh-spin' : 'bi-funnel'"></i>
          <span>Applica</span>
        </button>
      </div>
    </div>

    <div class="oh-summary" v-if="!loading && days.length > 0">
      <div class="oh-kpi">
        <div class="oh-kpi-label">Giorni</div>
        <div class="oh-kpi-value">{{ days.length }}</div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-label">Ordini</div>
        <div class="oh-kpi-value">{{ totalsAll.orders }}</div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-label">Articoli</div>
        <div class="oh-kpi-value">{{ totalsAll.units }}</div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-label">Incasso</div>
        <div class="oh-kpi-value">{{ totalsAll.revenue.toFixed(2) }} &euro;</div>
      </div>
    </div>

    <div v-if="error" class="ds-card oh-error">
      <i class="bi bi-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="ds-card oh-empty">
      <i class="bi bi-arrow-repeat oh-spin"></i> Caricamento storico…
    </div>
    <div v-else-if="days.length === 0" class="ds-card oh-empty">
      <i class="bi bi-inbox"></i>
      <span>Nessun ordine nel periodo selezionato.</span>
    </div>
    <div v-else class="oh-days">
      <article v-for="d in days" :key="d.date" class="ds-card oh-day">
        <header class="oh-day-head" @click="toggleDay(d.date)">
          <div class="oh-day-info">
            <i class="bi" :class="expandedDays.has(d.date) ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
            <span class="oh-day-title">{{ formatDate(d.date) }}</span>
          </div>
          <div class="oh-day-totals">
            <span class="oh-pill"><i class="bi bi-receipt"></i> {{ d.totals.orders_count }}</span>
            <span class="oh-pill"><i class="bi bi-bag"></i> {{ d.totals.items_units }}</span>
            <span class="oh-pill oh-pill-revenue">{{ Number(d.totals.revenue || 0).toFixed(2) }} &euro;</span>
          </div>
        </header>

        <div v-if="expandedDays.has(d.date)" class="oh-orders">
          <article
            v-for="o in d.orders"
            :key="o.documentId || o.order_document_id"
            class="oh-order"
          >
            <header class="oh-order-head" @click="toggleOrder(o.documentId || o.order_document_id)">
              <div class="oh-order-info">
                <i class="bi" :class="expandedOrders.has(o.documentId || o.order_document_id) ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
                <span class="oh-order-icon">
                  <i class="bi" :class="o.service_type === 'takeaway' ? 'bi-bag-check' : 'bi-grid-3x3-gap'"></i>
                </span>
                <div class="oh-order-text">
                  <div class="oh-order-title">{{ orderLabel(o) }}</div>
                  <div class="oh-order-sub">{{ orderSubtitle(o) }}</div>
                </div>
              </div>
              <div class="oh-order-vals">
                <span class="oh-pill"><i class="bi bi-list-ul"></i> {{ o.items_count }} art.</span>
                <span class="oh-pill oh-pill-revenue">{{ Number(o.total_amount).toFixed(2) }} &euro;</span>
              </div>
            </header>

            <div v-if="expandedOrders.has(o.documentId || o.order_document_id)" class="oh-items">
              <div v-if="!o.items || o.items.length === 0" class="oh-items-empty">
                <i class="bi bi-inbox"></i> Nessun articolo nel snapshot.
              </div>
              <table v-else class="oh-items-table">
                <thead>
                  <tr>
                    <th>Articolo</th>
                    <th class="t-right">Q.ta</th>
                    <th class="t-right">Prezzo</th>
                    <th class="t-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(it, idx) in o.items" :key="`it-${idx}`">
                    <td>
                      <span class="oh-item-name">{{ it.name }}</span>
                      <span v-if="it.notes" class="oh-item-notes"><i class="bi bi-chat-text"></i> {{ it.notes }}</span>
                    </td>
                    <td class="t-right">{{ it.quantity }}</td>
                    <td class="t-right">{{ Number(it.price || 0).toFixed(2) }} &euro;</td>
                    <td class="t-right">{{ (Number(it.price || 0) * Number(it.quantity || 0)).toFixed(2) }} &euro;</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="o.payment_method || o.payment_reference" class="oh-pay">
                <i class="bi bi-credit-card"></i>
                <span v-if="o.payment_method">Pagamento: {{ o.payment_method }}</span>
                <span v-if="o.payment_reference" class="oh-pay-ref">({{ o.payment_reference }})</span>
              </div>
            </div>
          </article>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.oh-page { padding: 16px 16px 32px; display: flex; flex-direction: column; gap: 14px; max-width: 1200px; margin: 0 auto; }
.oh-page--modal { padding: 16px 16px 32px; max-width: none; }

.oh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.overline { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3, #6b7280); margin-bottom: 4px; }
.oh-head h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.oh-head p { margin: 0; max-width: 640px; font-size: 14px; color: var(--ink-2, #4b5563); line-height: 1.5; }

.oh-filters { display: flex; align-items: flex-end; gap: 12px; padding: 12px 16px; flex-wrap: wrap; }
.oh-filter { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.oh-filter .ds-label { font-size: 12px; color: var(--color-text-muted); }
.oh-filter-actions { justify-content: flex-end; margin-left: auto; }

.oh-summary { display: flex; gap: 10px; flex-wrap: wrap; }
.oh-kpi { flex: 1; min-width: 120px; padding: 12px 16px; background: var(--color-bg-subtle); border: 1px solid var(--color-border); border-radius: 10px; }
.oh-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); }
.oh-kpi-value { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }

.oh-error { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: var(--color-destructive); }
.oh-empty { padding: 24px; text-align: center; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }

.oh-days { display: flex; flex-direction: column; gap: 10px; }
.oh-day { padding: 0; overflow: hidden; }
.oh-day-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 16px; cursor: pointer; user-select: none;
}
.oh-day-head:hover { background: var(--color-bg-subtle); }
.oh-day-info { display: flex; align-items: center; gap: 10px; }
.oh-day-title { font-size: 16px; font-weight: 600; text-transform: capitalize; }
.oh-day-totals { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.oh-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: var(--color-bg-subtle); border: 1px solid var(--color-border);
  font-size: 12px; color: var(--color-text-secondary);
}
.oh-pill-revenue { color: var(--ac, var(--color-primary)); font-weight: 600; }

.oh-orders { padding: 0 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.oh-order { border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.oh-order-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 12px; cursor: pointer; user-select: none;
}
.oh-order-head:hover { background: var(--color-bg-subtle); }
.oh-order-info { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.oh-order-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--color-bg-subtle); border: 1px solid var(--color-border);
}
.oh-order-text { min-width: 0; flex: 1; }
.oh-order-title { font-weight: 500; font-size: 14px; }
.oh-order-sub { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
.oh-order-vals { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.oh-items { padding: 8px 12px 12px; border-top: 1px solid var(--color-border); background: var(--color-bg-subtle); }
.oh-items-empty { padding: 16px; text-align: center; color: var(--color-text-muted); }
.oh-items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.oh-items-table th, .oh-items-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--color-border); }
.oh-items-table th { font-weight: 600; color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.oh-items-table tbody tr:last-child td { border-bottom: none; }
.t-right { text-align: right; }
.oh-item-name { display: block; font-weight: 500; }
.oh-item-notes { display: block; font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.oh-pay { margin-top: 8px; font-size: 12px; color: var(--color-text-muted); display: flex; gap: 8px; align-items: center; }
.oh-pay-ref { font-family: ui-monospace, SFMono-Regular, monospace; }

.oh-spin { animation: oh-spin 0.8s linear infinite; display: inline-block; }
@keyframes oh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  .oh-filter { min-width: 0; flex: 1 1 calc(50% - 6px); }
  .oh-filter-actions { flex: 1 1 100%; margin-left: 0; }
  .oh-day-title { font-size: 14px; }
  .oh-order-vals { font-size: 11px; }
}
</style>

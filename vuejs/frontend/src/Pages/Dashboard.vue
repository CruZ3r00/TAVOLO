<script setup>
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import Skeleton from '@/components/Skeleton.vue';
import CheckoutModal from '@/components/CheckoutModal.vue';
import { onMounted, nextTick, ref, computed } from 'vue';
import { useStore } from 'vuex';
import {
  API_BASE,
  fetchTables, fetchOrders, fetchReservations, fetchTakeaways,
  closeOrder, pickupTakeaway,
  fetchWebsiteConfig, updateCoverCharge,
  orderErrorMessage,
} from '@/utils';

const router = useRouter();
const store = useStore();
const username = ref('');

const elementCount = ref(0);
const categoryCount = ref(0);
const foodCount = ref(0);
const drinkCount = ref(0);
const uniqueIngredientsCount = ref(0);
const uniqueAllergensCount = ref(0);
const categoriesDetail = ref([]);

const tables = ref([]);
const activeOrders = ref([]);
const activeTakeaways = ref([]);
const todayReservations = ref([]);

const hasSiteConfig = ref(false);
const restaurantName = ref('');
const siteUrl = ref('');
const coverCharge = ref(0);

const loading = ref(true);

// Checkout modal: stato unificato per tavoli e takeaway. Aprire il
// CheckoutModal e' l'unico modo di chiudere un conto in tutta l'app
// (rimosso da OrderDetailModal per evitare confusione UX).
const showCheckout = ref(false);
const checkoutOrder = ref(null);
const checkoutBusy = ref(false);
const checkoutPersons = ref(0);
const toast = ref(null);
let toastTimer = null;
const showToast = (type, message) => {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { type, message };
  toastTimer = setTimeout(() => { toast.value = null; }, type === 'error' ? 5000 : 3500);
};

const now = ref(new Date());
const serviceTime = computed(() => now.value.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
const todayLabel = computed(() => now.value.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));

const greeting = computed(() => {
  const h = now.value.getHours();
  if (h < 12) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
});

const occupiedTables = computed(() => tables.value.filter(t => t.status === 'occupied').length);
const totalTables = computed(() => tables.value.length);
const totalCovers = computed(() => activeOrders.value.reduce((s, o) => s + (o.covers || 0), 0));
const todayRevenue = computed(() => activeOrders.value.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0));
const avgTicket = computed(() => activeOrders.value.length === 0 ? 0 : todayRevenue.value / activeOrders.value.length);

const fmtEuro = (v) => `€${(v || 0).toFixed(2).replace('.', ',')}`;

const loadStats = async () => {
  const tkn = store.getters.getToken;
  if (!tkn) { loading.value = false; return; }
  try {
    const userRes = await fetch(`${API_BASE}/api/users/me?populate=*`, {
      headers: { Authorization: `Bearer ${tkn}` },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      username.value = userData.username;
    }

    const menuRes = await fetch(`${API_BASE}/api/menus`, {
      headers: { Authorization: `Bearer ${tkn}` },
    });
    if (menuRes.ok) {
      const menuData = await menuRes.json();
      if (menuData.data?.length > 0) {
        const elements = menuData.data[0].fk_elements || [];
        elementCount.value = elements.length;
        const cats = new Set(elements.map(el => el.category));
        categoryCount.value = cats.size;
        const drinkCategories = ['bevande'];
        drinkCount.value = elements.filter(el => drinkCategories.includes((el.category || '').toLowerCase())).length;
        foodCount.value = elementCount.value - drinkCount.value;
        const ingSet = new Set();
        const algSet = new Set();
        for (const el of elements) {
          if (Array.isArray(el.ingredients)) el.ingredients.forEach(i => ingSet.add(String(i).toLowerCase()));
          if (Array.isArray(el.allergens)) el.allergens.forEach(a => algSet.add(String(a).toLowerCase()));
        }
        uniqueIngredientsCount.value = ingSet.size;
        uniqueAllergensCount.value = algSet.size;
        const catMap = {};
        for (const el of elements) catMap[el.category] = (catMap[el.category] || 0) + 1;
        categoriesDetail.value = Object.entries(catMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    const wcRes = await fetch(`${API_BASE}/api/account/website-config`, {
      headers: { Authorization: `Bearer ${tkn}` },
    });
    if (wcRes.ok) {
      const wcData = await wcRes.json();
      if (wcData.data) {
        hasSiteConfig.value = !!wcData.data.site_url;
        restaurantName.value = wcData.data.restaurant_name || '';
        siteUrl.value = wcData.data.site_url || '';
      }
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const [tablesResp, ordersResp, takeawayResp, resvResp, wcData] = await Promise.all([
      fetchTables(tkn).catch(() => ({ data: [] })),
      fetchOrders({ status: 'active', service_type: 'table', pageSize: 100 }, tkn).catch(() => ({ data: [] })),
      fetchTakeaways({ status: 'active', pageSize: 100 }, tkn).catch(() => ({ data: [] })),
      fetchReservations({
        status: 'pending,confirmed,at_restaurant,completed',
        from: today.toISOString(),
        to: tomorrow.toISOString(),
        pageSize: 100,
      }, tkn).catch(() => ({ data: [] })),
      fetchWebsiteConfig(tkn).catch(() => null),
    ]);
    tables.value = Array.isArray(tablesResp?.data) ? tablesResp.data : [];
    activeOrders.value = Array.isArray(ordersResp?.data) ? ordersResp.data : [];
    activeTakeaways.value = Array.isArray(takeawayResp?.data) ? takeawayResp.data : [];
    todayReservations.value = Array.isArray(resvResp?.data) ? resvResp.data : [];
    if (wcData) {
      coverCharge.value = Number(wcData.cover_charge) || 0;
    }
  } catch (_e) { /* silent */ }
  finally { loading.value = false; }
};

onMounted(async () => {
  nextTick(() => { document.title = 'Dashboard · Tavolo'; });
  await loadStats();
  setInterval(() => { now.value = new Date(); }, 30000);
});

function tableState(t) {
  if (t.status === 'reserved') return 'res';
  if (t.status === 'occupied') {
    const order = activeOrders.value.find(o => o.status === 'active' && o.table?.documentId === t.documentId);
    if (order?.items?.some(i => i.status === 'ready')) return 'ready';
    return 'busy';
  }
  return 'free';
}
function tableOrder(t) {
  return activeOrders.value.find(o => o.status === 'active' && o.table?.documentId === t.documentId);
}
function tableMinutes(t) {
  const order = tableOrder(t);
  if (!order?.opened_at) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(order.opened_at).getTime()) / 60000));
}

const previewTables = computed(() => {
  return [...tables.value]
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .slice(0, 12);
});

// Apertura checkout: la chiusura conto avviene SOLO da Dashboard.
// Click su un tavolo occupato → trova l'ordine attivo e apre CheckoutModal.
const openCheckoutForTable = (t) => {
  const order = tableOrder(t);
  if (!order) return;
  checkoutOrder.value = order;
  checkoutPersons.value = Number(order.covers) || 1;
  showCheckout.value = true;
};

// Click su una card asporto → checkout. I takeaway non hanno coperto.
const openCheckoutForTakeaway = (order) => {
  if (!order || order.takeaway_status !== 'picked_up') return;
  checkoutOrder.value = order;
  checkoutPersons.value = 0;
  showCheckout.value = true;
};

// Marca takeaway come ritirato (passaggio FSM richiesto prima del pagamento).
const markTakeawayPicked = async (order) => {
  const tkn = store.getters.getToken;
  if (!tkn) return;
  try {
    await pickupTakeaway(order.documentId, tkn);
    showToast('success', 'Asporto ritirato. Ora puoi chiudere il conto.');
    await loadStats();
  } catch (err) {
    showToast('error', orderErrorMessage(err));
  }
};

const onConfirmCheckout = async (payload) => {
  if (!checkoutOrder.value || checkoutBusy.value) return;
  checkoutBusy.value = true;
  const tkn = store.getters.getToken;
  try {
    const result = await closeOrder(checkoutOrder.value.documentId, payload, tkn);
    showCheckout.value = false;
    if (result?.queued) {
      showToast('success', `Richiesta inviata al POS/RT. Rif: ${result.event_id || 'OK'}`);
    } else {
      showToast('success', `Conto chiuso. Rif: ${result?.payment?.transactionId || 'OK'}`);
    }
    checkoutOrder.value = null;
    await loadStats();
  } catch (err) {
    showToast('error', orderErrorMessage(err));
  } finally {
    checkoutBusy.value = false;
  }
};

const onSaveCoverDefault = async (value) => {
  const tkn = store.getters.getToken;
  if (!tkn) return;
  try {
    const updated = await updateCoverCharge(value, tkn);
    coverCharge.value = Number(updated?.cover_charge) || Number(value) || 0;
    showToast('success', `Coperto di default impostato a € ${(Number(value) || 0).toFixed(2)}.`);
  } catch (err) {
    showToast('error', orderErrorMessage(err) || 'Errore nel salvataggio del coperto.');
  }
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch (_e) { return '—'; }
};
const takeawayStatusLabel = (s) => {
  switch (s) {
    case 'pending_acceptance': return 'In attesa';
    case 'confirmed': return 'Confermato';
    case 'sent_to_departments': return 'In preparazione';
    case 'ready': return 'Pronto';
    case 'picked_up': return 'Ritirato';
    default: return s || '—';
  }
};
const isTakeawayPickedUp = (o) => o?.takeaway_status === 'picked_up';
</script>

<template>
  <AppLayout page-title="Dashboard">
    <div class="md-main">
      <header class="md-top">
        <div>
          <div class="overline">Manager · {{ todayLabel }}</div>
          <h1>{{ greeting }}, {{ username || '...' }}.</h1>
          <p>
            Servizio in corso ·
            {{ occupiedTables }} tavoli attivi ·
            {{ totalCovers }} coperti finora.
          </p>
        </div>
        <div class="md-top-tools">
          <span class="chip ac"><span class="tv-pulse"></span> LIVE {{ serviceTime }}</span>
          <button type="button" class="btn btn-sm" @click="router.push('/orders')">
            <i class="bi bi-grid-3x3-gap"></i><span>Vai in sala</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" @click="router.push('/reservations')">
            <i class="bi bi-calendar-plus"></i><span>Nuova prenotazione</span>
          </button>
        </div>
      </header>

      <!-- Skeleton loading -->
      <template v-if="loading">
        <div class="md-kpis">
          <div v-for="n in 4" :key="n" class="md-kpi">
            <Skeleton width="60%" height="14px" />
            <Skeleton width="40%" height="32px" style="margin: 8px 0 4px;" />
            <Skeleton width="80%" height="11px" />
          </div>
        </div>
        <div class="md-card">
          <Skeleton width="40%" height="18px" />
          <div class="md-tables-grid" style="margin-top: 16px;">
            <Skeleton v-for="n in 8" :key="n" height="92px" radius="10px" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="md-kpis">
          <div class="md-kpi">
            <div class="md-kpi-head">
              <span class="md-kpi-l"><i class="bi bi-people"></i> Coperti oggi</span>
            </div>
            <div class="md-kpi-v">{{ totalCovers }}</div>
            <div class="md-kpi-foot">
              <span class="md-kpi-d">su {{ todayReservations.length }} prenotazioni</span>
            </div>
          </div>

          <div class="md-kpi">
            <div class="md-kpi-head">
              <span class="md-kpi-l"><i class="bi bi-cash-stack"></i> Incasso ordini attivi</span>
            </div>
            <div class="md-kpi-v">{{ fmtEuro(todayRevenue) }}</div>
            <div class="md-kpi-foot">
              <span class="md-kpi-d">{{ activeOrders.length }} ordini in corso</span>
            </div>
          </div>

          <div class="md-kpi">
            <div class="md-kpi-head">
              <span class="md-kpi-l"><i class="bi bi-receipt"></i> Scontrino medio</span>
            </div>
            <div class="md-kpi-v">{{ fmtEuro(avgTicket) }}</div>
            <div class="md-kpi-foot">
              <span class="md-kpi-d">stima sui tavoli aperti</span>
            </div>
          </div>

          <div class="md-kpi">
            <div class="md-kpi-head">
              <span class="md-kpi-l"><i class="bi bi-grid-3x3-gap"></i> Tavoli attivi</span>
            </div>
            <div class="md-kpi-v">{{ occupiedTables }}<span class="md-kpi-sub">/{{ totalTables }}</span></div>
            <div class="md-kpi-foot">
              <span class="md-kpi-d">{{ totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0 }}% saturazione</span>
            </div>
          </div>
        </div>

        <div class="md-card md-tables">
          <div class="md-card-h">
            <div>
              <div class="md-card-t">Sala in tempo reale</div>
              <div class="md-card-st">{{ occupiedTables }} occupati · {{ totalTables - occupiedTables }} liberi</div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span class="chip ok">Liberi {{ totalTables - occupiedTables }}</span>
              <span class="chip ac">Occupati {{ occupiedTables }}</span>
            </div>
          </div>
          <div v-if="previewTables.length" class="md-tables-grid">
            <div
              v-for="t in previewTables"
              :key="t.documentId"
              class="md-tbl"
              :class="[tableState(t), { alert: tableMinutes(t) > 60, occupied: t.status === 'occupied' }]"
              :title="t.status === 'occupied' ? 'Apri checkout per chiudere il conto' : (tableState(t) === 'free' ? 'Tavolo libero' : 'Tavolo prenotato')"
              @click="t.status === 'occupied' ? openCheckoutForTable(t) : router.push('/orders')"
              style="cursor: pointer;"
            >
              <div class="md-tbl-head">
                <span class="md-tbl-n">{{ String(t.number).padStart(2, '0') }}</span>
                <span v-if="t.status === 'occupied'" class="md-tbl-cov"><i class="bi bi-people"></i>{{ tableOrder(t)?.covers || t.seats }}</span>
                <span v-if="tableState(t) === 'ready'" class="chip ok" style="padding: 1px 6px; font-size: 10px;">CONTO</span>
                <span v-if="tableMinutes(t) > 60" class="md-tbl-alert"><i class="bi bi-exclamation-triangle-fill"></i></span>
              </div>
              <div v-if="tableState(t) === 'free'" class="md-tbl-state">libero · {{ t.seats }} posti</div>
              <div v-else-if="tableState(t) === 'res'" class="md-tbl-state">prenotato</div>
              <template v-else>
                <div class="md-tbl-total">{{ fmtEuro(parseFloat(tableOrder(t)?.total_amount || 0)) }}</div>
                <div class="md-tbl-mins">{{ tableMinutes(t) }} min al tavolo</div>
                <div class="md-tbl-cta">
                  <i class="bi bi-receipt-cutoff" aria-hidden="true"></i>
                  <span>Chiudi conto</span>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="kr-col-empty" style="margin-top: 8px;">
            <i class="bi bi-grid-3x3-gap"></i>
            <span>Nessun tavolo configurato. <router-link to="/reservations">Aggiungi i tuoi tavoli</router-link>.</span>
          </div>
        </div>

        <!-- Asporto attivo: monitoring + chiusura conto -->
        <div v-if="activeTakeaways.length > 0" class="md-card md-takeaway">
          <div class="md-card-h">
            <div>
              <div class="md-card-t">Asporto attivo</div>
              <div class="md-card-st">{{ activeTakeaways.length }} {{ activeTakeaways.length === 1 ? 'ordine' : 'ordini' }} in coda · chiudi i conti dopo il ritiro</div>
            </div>
          </div>
          <div class="md-takeaway-list">
            <article
              v-for="o in activeTakeaways"
              :key="o.documentId"
              class="md-takeaway-row"
              :class="`s-${o.takeaway_status || 'unknown'}`"
            >
              <div class="md-takeaway-head">
                <strong class="md-takeaway-name">{{ o.customer_name || 'Cliente' }}</strong>
                <span class="md-takeaway-status">{{ takeawayStatusLabel(o.takeaway_status) }}</span>
              </div>
              <div class="md-takeaway-meta">
                <span><i class="bi bi-clock"></i> ritiro {{ fmtTime(o.pickup_at) }}</span>
                <span v-if="o.customer_phone"><i class="bi bi-telephone"></i> {{ o.customer_phone }}</span>
                <span class="md-takeaway-total">{{ fmtEuro(parseFloat(o.total_amount || 0)) }}</span>
              </div>
              <div class="md-takeaway-actions">
                <button
                  v-if="o.takeaway_status === 'ready'"
                  type="button"
                  class="btn btn-sm"
                  @click="markTakeawayPicked(o)"
                >
                  <i class="bi bi-box-arrow-up"></i><span>Segna ritirato</span>
                </button>
                <button
                  v-if="isTakeawayPickedUp(o)"
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="openCheckoutForTakeaway(o)"
                >
                  <i class="bi bi-receipt-cutoff"></i><span>Chiudi conto</span>
                </button>
              </div>
            </article>
          </div>
        </div>

        <div class="md-grid-1">
          <div class="md-card">
            <div class="md-card-h">
              <div>
                <div class="md-card-t">Composizione del menu</div>
                <div class="md-card-st">{{ elementCount }} elementi · {{ categoryCount }} categorie</div>
              </div>
              <button class="btn btn-sm btn-ghost" @click="router.push('/menu-handler')">
                Gestisci <i class="bi bi-arrow-right"></i>
              </button>
            </div>
            <ol v-if="categoriesDetail.length" class="md-top-list">
              <li v-for="(cat, i) in categoriesDetail.slice(0, 6)" :key="cat.name">
                <span class="md-top-rank">{{ i + 1 }}</span>
                <div class="md-top-mid">
                  <div class="md-top-name">{{ cat.name }}</div>
                  <div class="md-top-bar">
                    <span :style="{ width: (cat.count / Math.max(elementCount, 1) * 100) + '%' }"></span>
                  </div>
                </div>
                <div class="md-top-r">
                  <strong>{{ cat.count }}</strong>
                  <span>{{ Math.round(cat.count / Math.max(elementCount, 1) * 100) }}%</span>
                </div>
              </li>
            </ol>
            <div v-else class="kr-col-empty">
              <i class="bi bi-journal-text"></i>
              <span>Nessun elemento nel menu. <router-link to="/menu-handler">Inizia ora</router-link>.</span>
            </div>
          </div>

          <div class="md-card">
            <div class="md-card-h">
              <div>
                <div class="md-card-t">Sito pubblico</div>
                <div class="md-card-st">QR menu e prenotazioni online</div>
              </div>
              <span class="chip" :class="hasSiteConfig ? 'ok' : 'warn'">
                {{ hasSiteConfig ? 'Online' : 'Da configurare' }}
              </span>
            </div>
            <div v-if="hasSiteConfig" class="md-site-ok">
              <p style="margin: 0 0 8px; font-size: 13px; color: var(--ink-2);">
                <strong>{{ restaurantName }}</strong>
              </p>
              <a :href="siteUrl" target="_blank" rel="noopener" class="md-site-link">
                <i class="bi bi-link-45deg"></i>{{ siteUrl }}
                <i class="bi bi-box-arrow-up-right"></i>
              </a>
              <button type="button" class="btn btn-sm" style="margin-top: 12px;" @click="router.push('/profile/show?section=sito')">
                <i class="bi bi-sliders"></i> Configura
              </button>
            </div>
            <div v-else class="kr-col-empty">
              <i class="bi bi-globe2"></i>
              <span>Configura il tuo sito per attivare il QR menu pubblico.</span>
              <button type="button" class="btn btn-sm btn-primary" style="margin-top: 12px;" @click="router.push('/profile/show?section=sito')">
                <i class="bi bi-plus-lg"></i> Configura ora
              </button>
            </div>
          </div>
        </div>

        <div class="kr-footer">
          <div class="kr-foot-stat">
            <span class="overline">Piatti</span>
            <strong>{{ foodCount }}</strong>
          </div>
          <div class="kr-foot-stat">
            <span class="overline">Bevande</span>
            <strong>{{ drinkCount }}</strong>
          </div>
          <div class="kr-foot-stat">
            <span class="overline">Ingredienti tracciati</span>
            <strong>{{ uniqueIngredientsCount }}</strong>
          </div>
          <div class="kr-foot-stat">
            <span class="overline">Allergeni</span>
            <strong>{{ uniqueAllergensCount }}</strong>
          </div>
        </div>
      </template>
    </div>

    <!-- Toast feedback (success/error) -->
    <Transition name="fade">
      <div v-if="toast" class="md-toast" :class="`md-toast-${toast.type}`" role="status">
        <i :class="['bi', toast.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle']" aria-hidden="true"></i>
        <span>{{ toast.message }}</span>
      </div>
    </Transition>

    <!-- Checkout modal: chiusura conto unificata per tavoli e takeaway. -->
    <CheckoutModal
      :show="showCheckout"
      :order="checkoutOrder"
      :busy="checkoutBusy"
      :cover-charge="coverCharge"
      :default-persons="checkoutPersons"
      @close="showCheckout = false"
      @confirm="onConfirmCheckout"
      @save-cover-default="onSaveCoverDefault"
    />
  </AppLayout>
</template>

<style scoped>
.md-site-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--f-mono);
  font-size: 12.5px;
  color: var(--ac);
  text-decoration: none;
  word-break: break-all;
}
.md-site-link:hover { text-decoration: underline; }

.md-tbl.occupied { transition: transform var(--dur-fast), box-shadow var(--dur-fast); }
.md-tbl.occupied:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.md-tbl-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 4px 8px;
  font-family: var(--f-sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--ac);
  background: var(--ac-soft);
  border-radius: 6px;
  width: fit-content;
}
.md-tbl-cta i { font-size: 12px; }

/* ── Asporto attivo ── */
.md-takeaway { display: flex; flex-direction: column; gap: var(--s-3); }
.md-takeaway-list { display: flex; flex-direction: column; gap: 8px; }
.md-takeaway-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line);
  border-radius: 10px;
}
.md-takeaway-row.s-ready { border-left-color: var(--ok, #16a34a); }
.md-takeaway-row.s-picked_up { border-left-color: var(--ac); }
.md-takeaway-row.s-pending_acceptance { border-left-color: var(--warn, var(--ac)); }

.md-takeaway-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}
.md-takeaway-name { font-size: 14px; color: var(--ink); }
.md-takeaway-status {
  font-family: var(--f-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  background: var(--bg-sunk);
  border-radius: 999px;
}
.md-takeaway-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--ink-3);
}
.md-takeaway-meta i { margin-right: 4px; }
.md-takeaway-total {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.md-takeaway-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* ── Toast ── */
.md-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.14));
  background: var(--paper);
  border: 1px solid var(--line);
  font-size: 13.5px;
  font-weight: 500;
  max-width: 420px;
}
.md-toast-success {
  background: color-mix(in oklab, var(--ok, #16a34a) 10%, var(--paper));
  color: var(--ok-ink, #166534);
  border-color: color-mix(in oklab, var(--ok, #16a34a) 30%, transparent);
}
.md-toast-error {
  background: color-mix(in oklab, var(--danger) 10%, var(--paper));
  color: var(--danger);
  border-color: color-mix(in oklab, var(--danger) 30%, transparent);
}
.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px); }

@media (max-width: 640px) {
  .md-toast { left: 16px; right: 16px; bottom: 88px; max-width: none; }
  .md-takeaway-meta { flex-direction: column; align-items: flex-start; gap: 4px; }
  .md-takeaway-total { margin-left: 0; }
}
</style>

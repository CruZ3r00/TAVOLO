<script setup>
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import Skeleton from '@/components/Skeleton.vue';
import { onMounted, nextTick, ref, computed } from 'vue';
import { useStore } from 'vuex';
import { API_BASE, fetchTables, fetchOrders, fetchReservations } from '@/utils';

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
const todayReservations = ref([]);

const hasSiteConfig = ref(false);
const restaurantName = ref('');
const siteUrl = ref('');

const loading = ref(true);

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
    const [tablesResp, ordersResp, resvResp] = await Promise.all([
      fetchTables(tkn).catch(() => ({ data: [] })),
      fetchOrders({ status: 'active', pageSize: 100 }, tkn).catch(() => ({ data: [] })),
      fetchReservations({
        status: 'pending,confirmed,at_restaurant,completed',
        from: today.toISOString(),
        to: tomorrow.toISOString(),
        pageSize: 100,
      }, tkn).catch(() => ({ data: [] })),
    ]);
    tables.value = Array.isArray(tablesResp?.data) ? tablesResp.data : [];
    activeOrders.value = Array.isArray(ordersResp?.data) ? ordersResp.data : [];
    todayReservations.value = Array.isArray(resvResp?.data) ? resvResp.data : [];
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
              :class="[tableState(t), { alert: tableMinutes(t) > 60 }]"
              @click="router.push('/orders')"
              style="cursor: pointer;"
            >
              <div class="md-tbl-head">
                <span class="md-tbl-n">{{ String(t.number).padStart(2, '0') }}</span>
                <span v-if="t.status === 'occupied'" class="md-tbl-cov"><i class="bi bi-people"></i>{{ t.seats }}</span>
                <span v-if="tableState(t) === 'ready'" class="chip ok" style="padding: 1px 6px; font-size: 10px;">CONTO</span>
                <span v-if="tableMinutes(t) > 60" class="md-tbl-alert"><i class="bi bi-exclamation-triangle-fill"></i></span>
              </div>
              <div v-if="tableState(t) === 'free'" class="md-tbl-state">libero · {{ t.seats }} posti</div>
              <div v-else-if="tableState(t) === 'res'" class="md-tbl-state">prenotato</div>
              <template v-else>
                <div class="md-tbl-total">{{ fmtEuro(parseFloat(tableOrder(t)?.total_amount || 0)) }}</div>
                <div class="md-tbl-mins">{{ tableMinutes(t) }} min al tavolo</div>
              </template>
            </div>
          </div>
          <div v-else class="kr-col-empty" style="margin-top: 8px;">
            <i class="bi bi-grid-3x3-gap"></i>
            <span>Nessun tavolo configurato. <router-link to="/reservations">Aggiungi i tuoi tavoli</router-link>.</span>
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
</style>

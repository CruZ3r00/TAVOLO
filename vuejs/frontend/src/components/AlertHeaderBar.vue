<script setup>
// Header bar di alert magazzino: visibile **solo a OWNER su piano pro**,
// in cima all'AppLayout, su qualunque pagina protetta. Polling 30s
// (visibility-aware) di `/api/inventory/alerts?status=unread`.
//
// Su pagine con la PantryView aperta gli alert sono gia inline, ma questo
// banner serve a renderli visibili in ogni momento.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { STAFF_ROLES, staffRole } from '@/staffAccess';
import { fetchInventoryAlerts, acknowledgeAlert, inventoryErrorMessage } from '@/utils';

const store = useStore();
const token = computed(() => store.getters.getToken);
const user = computed(() => store.getters.getUser);

const isOwnerPro = computed(() => {
  if (staffRole(user.value) !== STAFF_ROLES.OWNER) return false;
  const plan = String(user.value?.subscription_plan || '').toLowerCase();
  return plan === 'pro';
});

const alerts = ref([]);
const expanded = ref(false);
const loading = ref(false);

let pollTimer = null;

const worstLevel = computed(() => {
  const order = { info: 0, warning: 1, critical: 2 };
  let worst = 'info';
  for (const a of alerts.value) {
    if ((order[a.level] || 0) > (order[worst] || 0)) worst = a.level;
  }
  return worst;
});

const fetchAlerts = async () => {
  if (!token.value || !isOwnerPro.value) return;
  loading.value = true;
  try {
    const resp = await fetchInventoryAlerts(token.value, { status: 'unread', limit: 5 });
    alerts.value = (resp && resp.data) || [];
  } catch (_e) {
    // Silenzioso: il banner e' una UX accessory, non blocca nulla.
  } finally {
    loading.value = false;
  }
};

const handleAck = async (alert) => {
  try {
    await acknowledgeAlert(token.value, alert.documentId);
    alerts.value = alerts.value.filter((a) => a.documentId !== alert.documentId);
  } catch (_e) { /* silent */ }
};

const startPoll = () => {
  stopPoll();
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    fetchAlerts();
  }, 30000);
};

const stopPoll = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
};

onMounted(() => {
  if (isOwnerPro.value) {
    fetchAlerts();
    startPoll();
  }
});
onBeforeUnmount(stopPoll);
</script>

<template>
  <div v-if="isOwnerPro && alerts.length > 0" class="ahb-banner" :class="`ahb-level-${worstLevel}`">
    <div class="ahb-summary" @click="expanded = !expanded">
      <i class="bi bi-bell-fill"></i>
      <strong>{{ alerts.length }} alert magazzino</strong>
      <span class="ahb-sep">·</span>
      <span class="ahb-summary-text">
        {{ worstLevel === 'critical' ? 'Ingredienti in esaurimento immediato.' : (worstLevel === 'warning' ? 'Rifornimenti da pianificare.' : 'Avviso magazzino') }}
      </span>
      <button class="ahb-toggle" :aria-expanded="expanded">
        <i class="bi" :class="expanded ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
      </button>
    </div>

    <div v-if="expanded" class="ahb-list">
      <div v-for="a in alerts" :key="a.documentId" class="ahb-item">
        <div class="ahb-item-info">
          <div class="ahb-item-title">
            <i class="bi" :class="a.alert_type === 'predictive' ? 'bi-clock-history' : 'bi-graph-down-arrow'"></i>
            <strong>{{ a.alert_type === 'predictive' ? 'Previsione esaurimento' : 'Soglia minima' }}</strong>
            <span class="ds-badge" :class="`ds-badge-${a.level === 'critical' ? 'danger' : (a.level === 'warning' ? 'warning' : 'soft')}`">
              {{ a.level === 'critical' ? 'Critico' : (a.level === 'warning' ? 'Attenzione' : 'Info') }}
            </span>
          </div>
          <ul class="ahb-ings">
            <li v-for="ing in (a.ingredients_payload || []).slice(0, 5)" :key="ing.fk_ingredient">
              {{ ing.name }} — stock {{ ing.stock_qty }} {{ ing.unit || '' }}
              <template v-if="a.alert_type === 'predictive' && ing.days_to_depletion !== null">
                · esaurito tra ~{{ Math.round(ing.days_to_depletion) }}g
              </template>
            </li>
            <li v-if="(a.ingredients_payload || []).length > 5" class="ahb-more">
              … e altri {{ (a.ingredients_payload || []).length - 5 }}
            </li>
          </ul>
        </div>
        <div class="ahb-item-actions">
          <router-link to="/menu-handler?tab=pantry" class="ds-btn ds-btn-ghost ds-btn-sm">
            <i class="bi bi-box-seam"></i>
            <span>Apri magazzino</span>
          </router-link>
          <button class="ds-btn ds-btn-ghost ds-btn-sm" @click="handleAck(a)">
            <i class="bi bi-check2"></i>
            <span>Archivia</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ahb-banner {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  font-size: 13px;
}
.ahb-level-critical { background: color-mix(in oklab, var(--color-destructive) 10%, var(--color-bg)); border-bottom-color: var(--color-destructive); }
.ahb-level-warning { background: color-mix(in oklab, var(--color-warning, #d97706) 10%, var(--color-bg)); border-bottom-color: var(--color-warning, #d97706); }

.ahb-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; cursor: pointer;
  flex-wrap: wrap;
}
.ahb-summary i { color: var(--color-warning, #d97706); }
.ahb-level-critical .ahb-summary i { color: var(--color-destructive); }
.ahb-sep { color: var(--color-text-muted); }
.ahb-summary-text { flex: 1; min-width: 0; }
.ahb-toggle {
  appearance: none; background: transparent; border: none; padding: 4px 8px; cursor: pointer; color: var(--color-text-muted); margin-left: auto;
}

.ahb-list { padding: 0 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.ahb-item { display: flex; gap: 12px; padding: 10px; background: var(--color-bg); border-radius: 6px; border: 1px solid var(--color-border); justify-content: space-between; flex-wrap: wrap; }
.ahb-item-info { flex: 1; min-width: 240px; }
.ahb-item-title { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px; }
.ahb-ings { margin: 0; padding-left: 18px; font-size: 12px; color: var(--color-text-secondary); }
.ahb-more { color: var(--color-text-muted); font-style: italic; }
.ahb-item-actions { display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap; }

@media (max-width: 640px) {
  .ahb-summary-text { display: none; }
}
</style>

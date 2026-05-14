<script setup>
// Pannello turno bar — usato sia come pagina staff (mode="page") sia come
// modal dentro la tab Bevande del MenuSetter (mode="modal").
//
// Funzionalita: stato turno corrente, KPI, tabella unita bottiglie, free-form,
// storico turni chiusi paginato, modale "Carico fatto".
// Polling 20s sospeso quando la pagina e' nascosta o il modale carico e' aperto.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import CaricoFattoModal from '@/components/CaricoFattoModal.vue';
import {
  fetchBarShiftCurrent,
  fetchBarShiftCurrentReport,
  openBarShift,
  fetchBarShiftHistory,
  fetchBarShiftReport,
  caricoFatto as apiCaricoFatto,
  barShiftErrorMessage,
} from '@/utils';

const props = defineProps({
  mode: { type: String, default: 'page' }, // 'page' | 'modal'
});
const emit = defineEmits(['close']);

const store = useStore();
const token = computed(() => store.getters.getToken);

const view = ref('current'); // 'current' | 'history'
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const toast = ref(null);

const currentShift = ref(null);
const currentReport = ref(null);
const elapsed = ref('—');
const openingShift = ref(false);
const showCarico = ref(false);
const submittingCarico = ref(false);

const history = ref([]);
const historyPage = ref(1);
const historyPageSize = ref(20);
const historyTotal = ref(0);
const historyLoading = ref(false);
const historyDetailReport = ref(null);
const historyDetailLoading = ref(false);

let pollTimer = null;
let elapsedTimer = null;

const hasOpenShift = computed(() => !!currentShift.value);

const totals = computed(() => {
  const r = currentReport.value;
  if (!r) return { revenue: 0, items_count: 0, units_total: 0, lines_count: 0 };
  const linesCount = (r.units?.length || 0) + (r.freeform?.length || 0);
  const unitsTotal = (r.units || []).reduce((s, u) => s + (Number(u.units_consumed) || 0), 0);
  return {
    revenue: r.totals?.revenue || 0,
    items_count: r.totals?.items_count || 0,
    units_total: unitsTotal,
    lines_count: linesCount,
  };
});

const showToast = (type, message, ms = 4000) => {
  toast.value = { type, message };
  setTimeout(() => { if (toast.value && toast.value.message === message) toast.value = null; }, ms);
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m} min`;
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_e) {
    return iso;
  }
};

const formatTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return iso;
  }
};

const updateElapsed = () => {
  if (!currentShift.value || !currentShift.value.opened_at) {
    elapsed.value = '—';
    return;
  }
  const open = new Date(currentShift.value.opened_at).getTime();
  if (Number.isNaN(open)) {
    elapsed.value = '—';
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - open) / 1000));
  elapsed.value = formatDuration(sec);
};

const loadCurrent = async () => {
  error.value = '';
  try {
    const s = await fetchBarShiftCurrent(token.value);
    currentShift.value = s;
    if (s) {
      try {
        currentReport.value = await fetchBarShiftCurrentReport(token.value);
      } catch (e) {
        if (e.code !== 'BAR_SHIFT_NOT_OPEN') throw e;
        currentReport.value = null;
      }
    } else {
      currentReport.value = null;
    }
    updateElapsed();
  } catch (e) {
    error.value = barShiftErrorMessage(e);
  }
};

const loadHistory = async (page = 1) => {
  historyLoading.value = true;
  try {
    const resp = await fetchBarShiftHistory(token.value, { page, pageSize: historyPageSize.value });
    history.value = resp?.data || [];
    historyTotal.value = resp?.meta?.total || 0;
    historyPage.value = resp?.meta?.page || page;
  } catch (e) {
    showToast('error', barShiftErrorMessage(e));
  } finally {
    historyLoading.value = false;
  }
};

const loadHistoryDetail = async (shift) => {
  historyDetailLoading.value = true;
  historyDetailReport.value = null;
  try {
    const idOrDoc = shift.documentId || shift.id;
    historyDetailReport.value = await fetchBarShiftReport(token.value, idOrDoc);
  } catch (e) {
    showToast('error', barShiftErrorMessage(e));
  } finally {
    historyDetailLoading.value = false;
  }
};

const handleOpenShift = async () => {
  openingShift.value = true;
  try {
    await openBarShift(token.value, {});
    showToast('success', 'Turno bar aperto.');
    await loadCurrent();
  } catch (e) {
    showToast('error', barShiftErrorMessage(e));
  } finally {
    openingShift.value = false;
  }
};

const handleConfirmCarico = async (payload) => {
  submittingCarico.value = true;
  try {
    const result = await apiCaricoFatto(token.value, { note: payload?.note || null });
    showToast('success', 'Carico fatto registrato. Nuovo turno aperto.');
    currentShift.value = result?.opened || null;
    currentReport.value = null;
    showCarico.value = false;
    await loadCurrent();
  } catch (e) {
    showToast('error', barShiftErrorMessage(e));
  } finally {
    submittingCarico.value = false;
  }
};

const handleRefresh = async () => {
  refreshing.value = true;
  try {
    if (view.value === 'current') await loadCurrent();
    else await loadHistory(historyPage.value);
  } finally {
    refreshing.value = false;
  }
};

const switchView = async (v) => {
  view.value = v;
  if (v === 'history' && history.value.length === 0) await loadHistory(1);
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (view.value !== 'current') return;
    if (showCarico.value) return;
    loadCurrent();
  }, 20000);
  elapsedTimer = setInterval(updateElapsed, 30000);
};

const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
};

onMounted(async () => {
  loading.value = true;
  await loadCurrent();
  loading.value = false;
  startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="bar-page" :class="{ 'bar-page--modal': mode === 'modal' }">
    <header class="bar-head">
      <div class="bar-head-info">
        <div class="overline">
          Turno bar
          <template v-if="hasOpenShift">
            · Aperto dalle {{ formatTime(currentShift.opened_at) }} · {{ elapsed }}
          </template>
        </div>
        <h1>{{ hasOpenShift ? 'Turno in corso' : 'Nessun turno aperto' }}</h1>
        <p v-if="hasOpenShift">
          Conta automatica delle unita di bottiglie consegnate al tavolo o ritirate (asporto).
          Al "Carico fatto" il turno corrente viene chiuso e ne parte subito uno nuovo.
        </p>
        <p v-else>
          Apri un turno per iniziare a tracciare le bevande consegnate. Useremo il conteggio
          al carico per sapere quante bottiglie riportare al frigo bar.
        </p>
      </div>
      <div class="bar-head-actions">
        <button
          type="button"
          class="ds-btn ds-btn-secondary"
          :disabled="refreshing || loading"
          @click="handleRefresh"
        >
          <i class="bi" :class="refreshing ? 'bi-arrow-repeat bar-spin' : 'bi-arrow-clockwise'"></i>
          <span>Aggiorna</span>
        </button>
        <button
          v-if="hasOpenShift"
          type="button"
          class="ds-btn ds-btn-primary"
          @click="showCarico = true"
        >
          <i class="bi bi-check2-circle"></i>
          <span>Carico fatto</span>
        </button>
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

    <div class="bar-tabs">
      <button
        type="button"
        class="bar-tab"
        :class="{ active: view === 'current' }"
        @click="switchView('current')"
      >
        <i class="bi bi-cup-straw"></i> Turno corrente
      </button>
      <button
        type="button"
        class="bar-tab"
        :class="{ active: view === 'history' }"
        @click="switchView('history')"
      >
        <i class="bi bi-clock-history"></i> Storico
      </button>
    </div>

    <div
      v-if="toast"
      class="bar-toast"
      :class="toast.type === 'error' ? 'bar-toast-error' : 'bar-toast-success'"
      role="alert"
    >
      <i :class="['bi', toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill']"></i>
      <span>{{ toast.message }}</span>
    </div>

    <div v-if="error" class="ds-card bar-error">
      <i class="bi bi-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>

    <template v-if="view === 'current'">
      <div v-if="loading" class="ds-card bar-empty">
        <i class="bi bi-arrow-repeat bar-spin"></i> Caricamento…
      </div>

      <div v-else-if="!hasOpenShift" class="ds-card bar-empty">
        <div class="bar-empty-icon"><i class="bi bi-cup-straw"></i></div>
        <h2>Nessun turno aperto</h2>
        <p>
          Avvia il turno per cominciare a contare le bottiglie usate. Quando hai finito,
          premi <strong>"Carico fatto"</strong> per chiuderlo e ripartire con uno nuovo.
        </p>
        <button
          type="button"
          class="ds-btn ds-btn-primary ds-btn-lg"
          :disabled="openingShift"
          @click="handleOpenShift"
        >
          <i v-if="openingShift" class="bi bi-arrow-repeat bar-spin"></i>
          <i v-else class="bi bi-play-circle"></i>
          <span>Apri turno bar</span>
        </button>
      </div>

      <template v-else>
        <div class="bar-kpis">
          <div class="ds-card bar-kpi">
            <div class="bar-kpi-label">Unita totali</div>
            <div class="bar-kpi-value">{{ totals.units_total }}</div>
            <div class="bar-kpi-hint">bottiglie/lattine consegnate</div>
          </div>
          <div class="ds-card bar-kpi">
            <div class="bar-kpi-label">Vendite</div>
            <div class="bar-kpi-value">{{ totals.items_count }}</div>
            <div class="bar-kpi-hint">item serviti</div>
          </div>
          <div class="ds-card bar-kpi">
            <div class="bar-kpi-label">Incasso</div>
            <div class="bar-kpi-value">{{ Number(totals.revenue).toFixed(2) }} &euro;</div>
            <div class="bar-kpi-hint">solo bar nel turno</div>
          </div>
          <div class="ds-card bar-kpi">
            <div class="bar-kpi-label">Voci attive</div>
            <div class="bar-kpi-value">{{ totals.lines_count }}</div>
            <div class="bar-kpi-hint">articoli distinti</div>
          </div>
        </div>

        <div class="ds-card bar-table-card">
          <div class="bar-table-head">
            <h3>Bevande consegnate</h3>
            <p>Conteggio per articolo del menu (flag bevanda).</p>
          </div>
          <div v-if="!currentReport || currentReport.units.length === 0" class="bar-table-empty">
            <i class="bi bi-inbox"></i>
            <span>Nessuna bevanda servita al momento.</span>
          </div>
          <div v-else class="bar-table-wrap">
            <table class="bar-table">
              <thead>
                <tr>
                  <th>Bevanda</th>
                  <th>Categoria</th>
                  <th class="t-right">Servite</th>
                  <th class="t-right">Unita</th>
                  <th class="t-right">Incasso</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in currentReport.units" :key="u.element_documentId">
                  <td>
                    <span class="bar-row-name">{{ u.name }}</span>
                    <span v-if="u.is_beverage_advanced" class="ds-badge ds-badge-success ds-badge-sm">
                      <i class="bi bi-stars"></i> Avanzata
                    </span>
                  </td>
                  <td>
                    <span v-if="u.category" class="ds-badge ds-badge-soft">{{ u.category }}</span>
                    <span v-else class="bar-muted">—</span>
                  </td>
                  <td class="t-right">{{ u.served_count }}</td>
                  <td class="t-right">
                    <strong v-if="u.units_consumed !== null">{{ u.units_consumed }}</strong>
                    <span v-else class="bar-muted" title="Calcolato dopo attivazione magazzino">—</span>
                  </td>
                  <td class="t-right">{{ Number(u.revenue || 0).toFixed(2) }} &euro;</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="currentReport && currentReport.freeform && currentReport.freeform.length > 0"
          class="ds-card bar-table-card"
        >
          <div class="bar-table-head bar-table-head-warn">
            <h3><i class="bi bi-exclamation-triangle"></i> Free-form (fuori menu)</h3>
            <p>
              Voci inserite a mano: contano nel revenue ma non sono conteggiate come unita
              di bottiglia. Considera di censirle come voce del menu per il prossimo turno.
            </p>
          </div>
          <div class="bar-table-wrap">
            <table class="bar-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th class="t-right">Servite</th>
                  <th class="t-right">Incasso</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, idx) in currentReport.freeform" :key="`ff-${idx}`">
                  <td>{{ f.name }}</td>
                  <td>
                    <span v-if="f.category" class="ds-badge ds-badge-soft">{{ f.category }}</span>
                    <span v-else class="bar-muted">—</span>
                  </td>
                  <td class="t-right">{{ f.served_count }}</td>
                  <td class="t-right">{{ Number(f.revenue || 0).toFixed(2) }} &euro;</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="ds-card bar-history-card">
        <div v-if="historyLoading" class="bar-table-empty">
          <i class="bi bi-arrow-repeat bar-spin"></i> Caricamento…
        </div>
        <div v-else-if="history.length === 0" class="bar-table-empty">
          <i class="bi bi-inbox"></i>
          <span>Nessun turno chiuso ancora.</span>
        </div>
        <table v-else class="bar-table">
          <thead>
            <tr>
              <th>Apertura</th>
              <th>Chiusura</th>
              <th>Durata</th>
              <th class="t-right">Unita</th>
              <th class="t-right">Incasso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in history" :key="s.id">
              <td>{{ formatDateTime(s.opened_at) }}</td>
              <td>{{ formatDateTime(s.closed_at) }}</td>
              <td>
                {{ formatDuration(
                  s.opened_at && s.closed_at
                    ? Math.max(0, Math.floor((new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 1000))
                    : 0
                ) }}
              </td>
              <td class="t-right">
                {{ (s.snapshot?.units || []).reduce((sum, u) => sum + (Number(u.units_consumed) || 0), 0) }}
              </td>
              <td class="t-right">
                {{ Number(s.snapshot?.totals?.revenue || 0).toFixed(2) }} &euro;
              </td>
              <td class="t-right">
                <button class="ds-btn ds-btn-ghost ds-btn-sm" @click="loadHistoryDetail(s)">
                  <i class="bi bi-eye"></i>
                  <span class="bar-hist-text">Dettaglio</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="historyTotal > historyPageSize" class="bar-history-pager">
          <button
            class="ds-btn ds-btn-ghost ds-btn-sm"
            :disabled="historyPage <= 1 || historyLoading"
            @click="loadHistory(historyPage - 1)"
          >
            <i class="bi bi-chevron-left"></i> Prec
          </button>
          <span>Pag. {{ historyPage }} / {{ Math.ceil(historyTotal / historyPageSize) }}</span>
          <button
            class="ds-btn ds-btn-ghost ds-btn-sm"
            :disabled="historyPage >= Math.ceil(historyTotal / historyPageSize) || historyLoading"
            @click="loadHistory(historyPage + 1)"
          >
            Succ <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      <div v-if="historyDetailReport" class="bar-detail-overlay" @click.self="historyDetailReport = null">
        <div class="bar-detail-card ds-card">
          <header class="bar-detail-head">
            <div>
              <h3>Dettaglio turno</h3>
              <p>{{ formatDateTime(historyDetailReport.opened_at) }} → {{ formatDateTime(historyDetailReport.closed_at) }}</p>
            </div>
            <button class="ds-btn ds-btn-ghost ds-btn-icon" @click="historyDetailReport = null">
              <i class="bi bi-x-lg"></i>
            </button>
          </header>
          <div v-if="historyDetailReport.units && historyDetailReport.units.length > 0">
            <table class="bar-table">
              <thead>
                <tr>
                  <th>Bevanda</th>
                  <th class="t-right">Servite</th>
                  <th class="t-right">Unita</th>
                  <th class="t-right">Incasso</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in historyDetailReport.units" :key="u.element_documentId">
                  <td>{{ u.name }}</td>
                  <td class="t-right">{{ u.served_count }}</td>
                  <td class="t-right">{{ u.units_consumed ?? '—' }}</td>
                  <td class="t-right">{{ Number(u.revenue || 0).toFixed(2) }} &euro;</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="bar-table-empty">
            <i class="bi bi-inbox"></i>
            <span>Nessuna bevanda nel turno.</span>
          </div>
        </div>
      </div>
    </template>

    <CaricoFattoModal
      v-if="showCarico"
      :report="currentReport"
      :submitting="submittingCarico"
      :opened-at="currentShift?.opened_at"
      :elapsed="elapsed"
      @cancel="showCarico = false"
      @confirm="handleConfirmCarico"
    />
  </div>
</template>

<style scoped>
.bar-page { padding: 24px 16px 96px; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.bar-page--modal { padding: 16px 16px 32px; max-width: none; }

.bar-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.bar-head-info .overline { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3, #6b7280); margin-bottom: 4px; }
.bar-head h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.bar-head p { margin: 0; max-width: 640px; font-size: 14px; color: var(--ink-2, #4b5563); line-height: 1.5; }
.bar-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.bar-tabs { display: inline-flex; gap: 4px; border-bottom: 1px solid var(--color-border); }
.bar-tab {
  appearance: none; background: transparent; border: none;
  padding: 10px 16px; font-size: 14px; font-weight: 500;
  color: var(--ink-3, #6b7280); cursor: pointer;
  border-bottom: 2px solid transparent;
}
.bar-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.bar-tab i { margin-right: 6px; }

.bar-toast {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: 8px; font-size: 14px;
}
.bar-toast-success { background: color-mix(in oklab, var(--color-success, #16a34a) 12%, var(--color-bg)); color: var(--color-success, #16a34a); }
.bar-toast-error { background: color-mix(in oklab, var(--color-destructive) 12%, var(--color-bg)); color: var(--color-destructive); }

.bar-error { display: flex; align-items: center; gap: 12px; padding: 16px; color: var(--color-destructive); }

.bar-empty { padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.bar-empty-icon { font-size: 56px; color: var(--color-primary); }
.bar-empty h2 { margin: 0; font-size: 20px; font-weight: 700; }
.bar-empty p { max-width: 480px; margin: 0; font-size: 14px; color: var(--color-text-secondary); line-height: 1.5; }

.bar-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.bar-kpi { padding: 16px; }
.bar-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3, #6b7280); margin-bottom: 6px; }
.bar-kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-text); }
.bar-kpi-hint { font-size: 12px; color: var(--ink-3, #6b7280); margin-top: 2px; }

.bar-table-card { padding: 0; overflow: hidden; }
.bar-table-head { padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.bar-table-head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.bar-table-head p { margin: 0; font-size: 13px; color: var(--color-text-muted); }
.bar-table-head-warn h3 i { color: var(--color-warning, #d97706); margin-right: 6px; }

.bar-table-empty { padding: 32px; text-align: center; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }
.bar-table-wrap { overflow-x: auto; }
.bar-table { width: 100%; border-collapse: collapse; }
.bar-table th, .bar-table td { padding: 12px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--color-border); }
.bar-table th { font-weight: 600; color: var(--color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; background: var(--color-bg-subtle); }
.bar-table tbody tr:last-child td { border-bottom: none; }
.t-right { text-align: right; }
.bar-row-name { font-weight: 500; margin-right: 6px; }
.bar-muted { color: var(--color-text-muted); }

.bar-history-card { padding: 0; overflow: hidden; }
.bar-history-pager {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 12px; border-top: 1px solid var(--color-border); font-size: 13px;
}
.bar-hist-text { display: inline; }

.bar-detail-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 400; padding: 16px;
}
.bar-detail-card { max-width: 720px; width: 100%; max-height: 80vh; overflow: auto; padding: 0; }
.bar-detail-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.bar-detail-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.bar-detail-head p { margin: 2px 0 0; font-size: 13px; color: var(--color-text-muted); }

.bar-spin { animation: bar-spin 0.8s linear infinite; display: inline-block; }
@keyframes bar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 860px) {
  .bar-kpis { grid-template-columns: repeat(2, 1fr); }
  .bar-table th, .bar-table td { padding: 10px 12px; font-size: 13px; }
  .bar-hist-text { display: none; }
}
@media (max-width: 480px) {
  .bar-kpis { grid-template-columns: 1fr; }
}
</style>

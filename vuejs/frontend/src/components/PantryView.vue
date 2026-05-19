<script setup>
// Gestione magazzino (Pro, owner-only).
// Embedded come tab "Magazzino" dentro MenuSetter.vue.
//
// Mostra:
//   - KPI (totale ingredienti, in critico, prossimo esaurimento)
//   - Tabella ingredienti: stock, soglia, predizione esaurimento, stato
//   - Azioni per riga: carico, scarto, conferma terminato, modifica, elimina
//   - Modali: NewIngredientModal, RestockModal, WasteModal, IngredientDepletionModal
//   - Sezione "Ordini di rifornimento" (pending + storico ultimi)
//   - Sezione "Alert attivi" inline

import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import RestockModal from '@/components/RestockModal.vue';
import NewRestockModal from '@/components/NewRestockModal.vue';
import WasteModal from '@/components/WasteModal.vue';
import IngredientDepletionModal from '@/components/IngredientDepletionModal.vue';
import AddonConfigModal from '@/components/AddonConfigModal.vue';
import Modal from '@/components/Modal.vue';
import {
  fetchIngredientsAdvanced,
  updateIngredient,
  deleteIngredient,
  fetchRestockOrders,
  receiveRestock,
  cancelRestock,
  fetchInventoryAlerts,
  acknowledgeAlert,
  inventoryErrorMessage,
  setIngredientAddonConfig,
} from '@/utils';

const store = useStore();
const token = computed(() => store.getters.getToken);

const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const toast = ref(null);

const ingredients = ref([]);
const restockOrders = ref([]);
const alerts = ref([]);

const showRestock = ref(false);
const showNewRestock = ref(false);
const showWaste = ref(false);
const showDepletion = ref(false);
const showEdit = ref(false);
const currentTarget = ref(null);

const editForm = ref(null);
const submitting = ref(false);

const showToast = (type, message, ms = 4000) => {
  toast.value = { type, message };
  setTimeout(() => { if (toast.value && toast.value.message === message) toast.value = null; }, ms);
};

/* ------------------------------------------------------------------ */
/* KPIs                                                               */
/* ------------------------------------------------------------------ */

const criticalCount = computed(() => ingredients.value.filter((i) => {
  if (i.days_to_depletion !== null && i.days_to_depletion <= 1) return true;
  if (i.low_stock_threshold && i.stock_qty <= i.low_stock_threshold * 0.2) return true;
  return false;
}).length);

const warningCount = computed(() => ingredients.value.filter((i) => {
  if (i.days_to_depletion === null) return false;
  if (i.days_to_depletion <= 1) return false; // gia critico
  const lead = Number(i.reorder_lead_days) || 3;
  return i.days_to_depletion <= lead + 1.5;
}).length);

const nextDepletionLabel = computed(() => {
  const list = ingredients.value
    .filter((i) => i.days_to_depletion !== null)
    .sort((a, b) => Number(a.days_to_depletion) - Number(b.days_to_depletion));
  if (list.length === 0) return '—';
  const first = list[0];
  const days = Number(first.days_to_depletion);
  if (days <= 0.5) return `${first.name} (oggi)`;
  if (days <= 1.5) return `${first.name} (domani)`;
  return `${first.name} (tra ${Math.round(days)}g)`;
});

const pendingRestocks = computed(() => restockOrders.value.filter((r) => r.status === 'ordered'));
const recentRestocks = computed(() => restockOrders.value.filter((r) => r.status !== 'ordered').slice(0, 5));

/* ------------------------------------------------------------------ */
/* Data                                                               */
/* ------------------------------------------------------------------ */

const loadAll = async () => {
  error.value = '';
  try {
    const [ings, rs, al] = await Promise.all([
      fetchIngredientsAdvanced(token.value),
      fetchRestockOrders(token.value, { pageSize: 50 }).catch(() => ({ data: [] })),
      fetchInventoryAlerts(token.value, { status: 'unread' }).catch(() => ({ data: [] })),
    ]);
    ingredients.value = ings;
    restockOrders.value = rs?.data || [];
    alerts.value = al?.data || [];
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  }
};

const handleRefresh = async () => {
  refreshing.value = true;
  await loadAll();
  refreshing.value = false;
};

/* ------------------------------------------------------------------ */
/* CRUD                                                               */
/* ------------------------------------------------------------------ */

const onNewRestockDone = async () => {
  showNewRestock.value = false;
  showToast('success', 'Rifornimento registrato.');
  await loadAll();
};

const openEdit = (ing) => {
  editForm.value = {
    documentId: ing.documentId,
    name: ing.name,
    unit: ing.unit,
    unit_size: ing.unit_size !== null ? String(ing.unit_size) : '',
    low_stock_threshold: ing.low_stock_threshold !== null ? String(ing.low_stock_threshold) : '',
    reorder_lead_days: String(ing.reorder_lead_days || 3),
    supplier_name: ing.supplier_name || '',
    supplier_email: ing.supplier_email || '',
  };
  showEdit.value = true;
};

const handleEdit = async () => {
  if (!editForm.value) return;
  submitting.value = true;
  try {
    const payload = {
      name: editForm.value.name.trim(),
      unit: editForm.value.unit,
      reorder_lead_days: Number(editForm.value.reorder_lead_days) || 3,
    };
    if (editForm.value.unit_size === '') payload.unit_size = null;
    else if (Number.isFinite(Number(editForm.value.unit_size))) payload.unit_size = Number(editForm.value.unit_size);
    if (editForm.value.low_stock_threshold === '') payload.low_stock_threshold = null;
    else if (Number.isFinite(Number(editForm.value.low_stock_threshold))) payload.low_stock_threshold = Number(editForm.value.low_stock_threshold);
    payload.supplier_name = editForm.value.supplier_name.trim() || null;
    payload.supplier_email = editForm.value.supplier_email.trim() || null;

    await updateIngredient(token.value, editForm.value.documentId, payload);
    showToast('success', 'Ingrediente aggiornato.');
    showEdit.value = false;
    editForm.value = null;
    await loadAll();
  } catch (e) {
    showToast('error', inventoryErrorMessage(e));
  } finally {
    submitting.value = false;
  }
};

const handleDelete = async (ing) => {
  if (!confirm(`Eliminare definitivamente "${ing.name}"? Lo storico movimenti resta.`)) return;
  submitting.value = true;
  try {
    await deleteIngredient(token.value, ing.documentId);
    showToast('success', 'Ingrediente eliminato.');
    await loadAll();
  } catch (e) {
    showToast('error', inventoryErrorMessage(e));
  } finally {
    submitting.value = false;
  }
};

const openRestock = (ing) => { currentTarget.value = ing; showRestock.value = true; };
const openWaste = (ing) => { currentTarget.value = ing; showWaste.value = true; };
const openDepletion = (ing) => { currentTarget.value = ing; showDepletion.value = true; };

const onActionDone = async (kind) => {
  showRestock.value = false;
  showWaste.value = false;
  showDepletion.value = false;
  currentTarget.value = null;
  showToast('success', kind === 'restock' ? 'Carico registrato.' : (kind === 'waste' ? 'Scarto registrato.' : 'Quantita aggiornata.'));
  await loadAll();
};

const handleReceiveRestock = async (order) => {
  const qtyStr = prompt(`Quantita ricevuta per "${order.fk_ingredient?.name || 'ingrediente'}" (atteso: ${order.expected_qty} ${order.fk_ingredient?.unit || ''})`, String(order.expected_qty));
  if (qtyStr === null) return;
  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty <= 0) {
    showToast('error', 'Quantita non valida.');
    return;
  }
  try {
    await receiveRestock(token.value, order.documentId, { received_qty: qty });
    showToast('success', 'Rifornimento ricevuto.');
    await loadAll();
  } catch (e) {
    showToast('error', inventoryErrorMessage(e));
  }
};

const handleCancelRestock = async (order) => {
  if (!confirm('Annullare questo ordine di rifornimento?')) return;
  try {
    await cancelRestock(token.value, order.documentId);
    showToast('success', 'Ordine annullato.');
    await loadAll();
  } catch (e) {
    showToast('error', inventoryErrorMessage(e));
  }
};

const handleAckAlert = async (alert) => {
  try {
    await acknowledgeAlert(token.value, alert.documentId);
    alerts.value = alerts.value.filter((a) => a.documentId !== alert.documentId);
    showToast('success', 'Alert archiviato.');
  } catch (e) {
    showToast('error', inventoryErrorMessage(e));
  }
};

/* ------------------------------------------------------------------ */
/* Format helpers                                                     */
/* ------------------------------------------------------------------ */

const formatStock = (ing) => `${Number(ing.stock_qty || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })} ${ing.unit || ''}`;

const formatPredicted = (ing) => {
  if (ing.days_to_depletion === null) return '—';
  const d = Number(ing.days_to_depletion);
  if (d <= 0.5) return 'oggi';
  if (d <= 1.5) return 'domani';
  if (d <= 7) return `tra ${Math.round(d)}g`;
  return `tra ~${Math.round(d)}g`;
};

const statusOf = (ing) => {
  if (ing.days_to_depletion !== null && ing.days_to_depletion <= 1) return 'critical';
  if (ing.low_stock_threshold && ing.stock_qty <= ing.low_stock_threshold * 0.2) return 'critical';
  if (ing.days_to_depletion !== null) {
    const lead = Number(ing.reorder_lead_days) || 3;
    if (ing.days_to_depletion <= lead + 1.5) return 'warning';
  }
  if (ing.low_stock_threshold && ing.stock_qty <= ing.low_stock_threshold) return 'warning';
  return 'ok';
};

// --- Addon config (Pro) ---
// Toggle ON->OFF: salva direttamente is_addon=false.
// Toggle OFF->ON: apre il modale di configurazione (prezzo + qty media);
//   se l'utente annulla, il toggle resta OFF.
// Bottone "configura" (icona): apre il modale in modalita' edit per
//   modificare prezzo/qty di un addon gia' attivo.
const showAddonConfig = ref(false);
const addonConfigTarget = ref(null);
const addonConfigMode = ref('edit'); // 'enable' | 'edit'

const onAddonToggle = async (ing) => {
  if (!ing.documentId) return;
  if (ing.is_addon) {
    // ON -> OFF: disattiva direttamente, server azzera prezzo/qty.
    ing.is_addon = false;
    ing.addon_price = null;
    ing.addon_avg_qty = null;
    try {
      await setIngredientAddonConfig(ing.documentId, { is_addon: false }, token.value);
    } catch (e) {
      console.error(e);
      ing.is_addon = true; // rollback
      showToast('error', inventoryErrorMessage(e) || 'Errore salvataggio addon.');
    }
  } else {
    // OFF -> ON: apri modale per impostare prezzo/qty.
    addonConfigTarget.value = ing;
    addonConfigMode.value = 'enable';
    showAddonConfig.value = true;
  }
};

const openAddonConfig = (ing) => {
  addonConfigTarget.value = ing;
  addonConfigMode.value = 'edit';
  showAddonConfig.value = true;
};

const onAddonSaved = (payload) => {
  const t = addonConfigTarget.value;
  if (t) {
    t.is_addon = true;
    t.addon_price = payload.addon_price;
    t.addon_avg_qty = payload.addon_avg_qty;
  }
  showAddonConfig.value = false;
  addonConfigTarget.value = null;
  showToast('success', 'Aggiunta configurata.');
};

const onAddonCancel = () => {
  // In modalita' 'enable' il toggle era ancora OFF, niente da ripristinare.
  showAddonConfig.value = false;
  addonConfigTarget.value = null;
};

onMounted(async () => {
  loading.value = true;
  await loadAll();
  loading.value = false;
});
</script>

<template>
  <div class="pantry-page">

    <!-- Header KPI -->
    <div class="pantry-kpis">
      <div class="ds-card pantry-kpi">
        <div class="pantry-kpi-label">Ingredienti</div>
        <div class="pantry-kpi-value">{{ ingredients.length }}</div>
        <div class="pantry-kpi-hint">tracciati a magazzino</div>
      </div>
      <div class="ds-card pantry-kpi" :class="{ 'pantry-kpi-danger': criticalCount > 0 }">
        <div class="pantry-kpi-label">Critici</div>
        <div class="pantry-kpi-value">{{ criticalCount }}</div>
        <div class="pantry-kpi-hint">{{ criticalCount === 1 ? 'in esaurimento' : 'in esaurimento' }}</div>
      </div>
      <div class="ds-card pantry-kpi" :class="{ 'pantry-kpi-warn': warningCount > 0 }">
        <div class="pantry-kpi-label">In allerta</div>
        <div class="pantry-kpi-value">{{ warningCount }}</div>
        <div class="pantry-kpi-hint">vicini alla soglia</div>
      </div>
      <div class="ds-card pantry-kpi">
        <div class="pantry-kpi-label">Prossimo esaurimento</div>
        <div class="pantry-kpi-value pantry-kpi-text">{{ nextDepletionLabel }}</div>
        <div class="pantry-kpi-hint">stima predittiva</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="pantry-toolbar">
      <button class="ds-btn ds-btn-secondary" :disabled="refreshing" @click="handleRefresh">
        <i class="bi" :class="refreshing ? 'bi-arrow-repeat pantry-spin' : 'bi-arrow-clockwise'"></i>
        <span>Aggiorna</span>
      </button>
      <button
        class="ds-btn ds-btn-primary"
        :disabled="ingredients.length === 0"
        :title="ingredients.length === 0 ? 'Aggiungi prima ingredienti dalla scheda Menu (ricetta di un piatto o bevanda).' : ''"
        @click="showNewRestock = true"
      >
        <i class="bi bi-arrow-down-circle"></i>
        <span>Nuovo rifornimento</span>
      </button>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="pantry-toast" :class="`pantry-toast-${toast.type}`" role="alert">
      <i :class="['bi', toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill']"></i>
      <span>{{ toast.message }}</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="ds-card pantry-error">
      <i class="bi bi-exclamation-triangle"></i>
      <span>{{ error }}</span>
      <button class="ds-btn ds-btn-secondary ds-btn-sm" @click="handleRefresh">Riprova</button>
    </div>

    <!-- Alert attivi -->
    <div v-if="alerts.length > 0" class="ds-card pantry-alerts">
      <h3>
        <i class="bi bi-bell-fill"></i>
        Alert attivi ({{ alerts.length }})
      </h3>
      <div v-for="a in alerts" :key="a.documentId" class="pantry-alert-row" :class="`pantry-alert-${a.level}`">
        <div class="pantry-alert-info">
          <strong>
            {{ a.alert_type === 'predictive' ? 'Previsione esaurimento' : 'Soglia minima raggiunta' }}
            ({{ a.level === 'critical' ? 'critico' : (a.level === 'warning' ? 'attenzione' : 'info') }})
          </strong>
          <ul>
            <li v-for="ing in a.ingredients_payload" :key="ing.fk_ingredient">
              {{ ing.name }} —
              <template v-if="a.alert_type === 'predictive'">
                stock {{ ing.stock_qty }} {{ ing.unit || '' }}, esaurito {{ ing.days_to_depletion !== null ? `tra ~${Math.round(ing.days_to_depletion)}g` : '—' }}
              </template>
              <template v-else>
                stock {{ ing.stock_qty }} {{ ing.unit || '' }} (soglia {{ ing.low_stock_threshold }})
              </template>
            </li>
          </ul>
        </div>
        <button class="ds-btn ds-btn-ghost ds-btn-sm" @click="handleAckAlert(a)">
          <i class="bi bi-check2"></i>
          <span>Archivia</span>
        </button>
      </div>
    </div>

    <!-- Tabella ingredienti -->
    <div v-if="!loading" class="ds-card pantry-table-card">
      <div v-if="ingredients.length === 0" class="pantry-empty">
        <div class="pantry-empty-icon"><i class="bi bi-box-seam"></i></div>
        <h3>Nessun ingrediente</h3>
        <p>
          Gli ingredienti compaiono qui quando vengono associati a un piatto o una bevanda
          dalla scheda <strong>Menu</strong>. Una volta presenti puoi registrarne i rifornimenti
          con il pulsante "Nuovo rifornimento".
        </p>
      </div>
      <div v-else class="pantry-table-wrap">
        <table class="pantry-table">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th class="t-right">Stock</th>
              <th class="t-right">Soglia</th>
              <th class="t-right">Esaurim.</th>
              <th>Stato</th>
              <th>Aggiunta</th>
              <th class="t-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ing in ingredients" :key="ing.documentId">
              <td>
                <span class="pantry-row-name">{{ ing.name }}</span>
                <span v-if="ing.is_unavailable" class="ds-badge ds-badge-danger ds-badge-sm">Terminato</span>
              </td>
              <td class="t-right">{{ formatStock(ing) }}</td>
              <td class="t-right">
                <template v-if="ing.low_stock_threshold !== null">
                  {{ ing.low_stock_threshold }} {{ ing.unit }}
                </template>
                <span v-else class="pantry-muted">—</span>
              </td>
              <td class="t-right">{{ formatPredicted(ing) }}</td>
              <td>
                <span class="pantry-status" :class="`pantry-status-${statusOf(ing)}`">
                  <i class="bi" :class="statusOf(ing) === 'critical' ? 'bi-exclamation-circle-fill' : (statusOf(ing) === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill')"></i>
                  {{ statusOf(ing) === 'critical' ? 'Critico' : (statusOf(ing) === 'warning' ? 'Attenzione' : 'OK') }}
                </span>
              </td>
              <td>
                <div class="pantry-addon-cell">
                  <label class="pantry-addon-switch" :title="ing.is_addon ? 'Disattiva aggiunta' : 'Attiva come aggiunta'">
                    <input type="checkbox" :checked="ing.is_addon" @change="onAddonToggle(ing)">
                    <span class="pantry-addon-slider"></span>
                  </label>
                  <button
                    v-if="ing.is_addon"
                    class="ds-btn ds-btn-ghost ds-btn-sm pantry-addon-config-btn"
                    title="Configura prezzo e quantita media"
                    @click="openAddonConfig(ing)"
                  >
                    <i class="bi bi-gear"></i>
                    <span class="pantry-addon-price">
                      € {{ Number(ing.addon_price || 0).toFixed(2) }}
                    </span>
                  </button>
                </div>
              </td>
              <td class="t-right">
                <div class="pantry-row-actions">
                  <button class="ds-btn ds-btn-ghost ds-btn-sm" title="Registra carico" @click="openRestock(ing)">
                    <i class="bi bi-arrow-down-circle"></i>
                  </button>
                  <button class="ds-btn ds-btn-ghost ds-btn-sm" title="Registra scarto" @click="openWaste(ing)">
                    <i class="bi bi-trash3"></i>
                  </button>
                  <button class="ds-btn ds-btn-ghost ds-btn-sm" title="Conferma terminato" @click="openDepletion(ing)">
                    <i class="bi bi-check2-square"></i>
                  </button>
                  <button class="ds-btn ds-btn-ghost ds-btn-sm" title="Modifica" @click="openEdit(ing)">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="ds-btn ds-btn-ghost ds-btn-sm" title="Elimina" @click="handleDelete(ing)">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Ordini di rifornimento pending -->
    <div v-if="pendingRestocks.length > 0" class="ds-card pantry-restock-card">
      <h3><i class="bi bi-truck"></i> Ordini in attesa ({{ pendingRestocks.length }})</h3>
      <table class="pantry-table">
        <thead>
          <tr>
            <th>Ingrediente</th>
            <th>Ordinato</th>
            <th class="t-right">Atteso</th>
            <th class="t-right">Costo</th>
            <th class="t-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in pendingRestocks" :key="o.documentId">
            <td>{{ o.fk_ingredient?.name || '—' }}</td>
            <td>{{ new Date(o.ordered_at).toLocaleDateString('it-IT') }}</td>
            <td class="t-right">{{ o.expected_qty }} {{ o.fk_ingredient?.unit || '' }}</td>
            <td class="t-right">{{ o.cost !== null ? `${o.cost.toFixed(2)} €` : '—' }}</td>
            <td class="t-right">
              <button class="ds-btn ds-btn-primary ds-btn-sm" @click="handleReceiveRestock(o)">
                <i class="bi bi-check-circle"></i> Ricevi
              </button>
              <button class="ds-btn ds-btn-ghost ds-btn-sm" @click="handleCancelRestock(o)">
                <i class="bi bi-x-lg"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modali -->
    <RestockModal
      v-if="showRestock && currentTarget"
      :ingredient="currentTarget"
      @cancel="showRestock = false"
      @done="onActionDone('restock')"
    />
    <NewRestockModal
      v-if="showNewRestock"
      :ingredients="ingredients"
      @cancel="showNewRestock = false"
      @done="onNewRestockDone"
    />
    <WasteModal
      v-if="showWaste && currentTarget"
      :ingredient="currentTarget"
      @cancel="showWaste = false"
      @done="onActionDone('waste')"
    />
    <IngredientDepletionModal
      v-if="showDepletion && currentTarget"
      :ingredient="currentTarget"
      @cancel="showDepletion = false"
      @done="onActionDone('depletion')"
    />
    <AddonConfigModal
      v-if="showAddonConfig && addonConfigTarget"
      :ingredient="addonConfigTarget"
      :is-pro="true"
      :mode="addonConfigMode"
      @cancel="onAddonCancel"
      @saved="onAddonSaved"
    />

    <!-- Modale modifica -->
    <Modal :show="showEdit && !!editForm" @close="showEdit = false">
      <template #title>Modifica: {{ editForm.name }}</template>
      <template #body>
        <div class="pantry-form">
          <label class="ds-field">
            <span class="ds-label">Nome</span>
            <input v-model="editForm.name" type="text" class="ds-input">
          </label>
          <div class="pantry-form-row">
            <label class="ds-field">
              <span class="ds-label">Unita</span>
              <select v-model="editForm.unit" class="ds-input ds-select">
                <option value="pz">Pezzi (pz)</option>
                <option value="g">Grammi (g)</option>
                <option value="kg">Chilogrammi (kg)</option>
                <option value="ml">Millilitri (ml)</option>
                <option value="l">Litri (l)</option>
                <option value="mazzo">Mazzo</option>
              </select>
            </label>
            <label class="ds-field">
              <span class="ds-label">Capacita unita</span>
              <input v-model="editForm.unit_size" type="number" min="0" step="0.01" class="ds-input">
            </label>
          </div>
          <div class="pantry-form-row">
            <label class="ds-field">
              <span class="ds-label">Soglia minima</span>
              <input v-model="editForm.low_stock_threshold" type="number" min="0" step="0.01" class="ds-input">
            </label>
            <label class="ds-field">
              <span class="ds-label">Lead time (giorni)</span>
              <input v-model="editForm.reorder_lead_days" type="number" min="0" step="0.5" class="ds-input">
            </label>
          </div>
          <div class="pantry-form-row">
            <label class="ds-field">
              <span class="ds-label">Fornitore</span>
              <input v-model="editForm.supplier_name" type="text" class="ds-input">
            </label>
            <label class="ds-field">
              <span class="ds-label">Email fornitore</span>
              <input v-model="editForm.supplier_email" type="email" class="ds-input">
            </label>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="ds-btn ds-btn-ghost" :disabled="submitting" @click="showEdit = false">Annulla</button>
        <button class="ds-btn ds-btn-primary" :disabled="submitting" @click="handleEdit">
          <i v-if="submitting" class="bi bi-arrow-repeat pantry-spin"></i>
          <i v-else class="bi bi-check2"></i>
          <span>Salva</span>
        </button>
      </template>
    </Modal>

  </div>
</template>

<style scoped>
.pantry-page { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }

.pantry-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.pantry-kpi { padding: 16px; }
.pantry-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); }
.pantry-kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; }
.pantry-kpi-text { font-size: 16px; font-weight: 600; }
.pantry-kpi-hint { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
.pantry-kpi-danger { border-left: 3px solid var(--color-destructive); }
.pantry-kpi-warn { border-left: 3px solid var(--color-warning, #d97706); }

.pantry-toolbar { display: flex; gap: 8px; flex-wrap: wrap; }

.pantry-toast { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; font-size: 14px; }
.pantry-toast-success { background: color-mix(in oklab, var(--color-success, #16a34a) 12%, var(--color-bg)); color: var(--color-success, #16a34a); }
.pantry-toast-error { background: color-mix(in oklab, var(--color-destructive) 12%, var(--color-bg)); color: var(--color-destructive); }

.pantry-error { display: flex; align-items: center; gap: 12px; padding: 16px; color: var(--color-destructive); }

.pantry-alerts { padding: 16px; }
.pantry-alerts h3 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.pantry-alerts h3 i { color: var(--color-warning, #d97706); margin-right: 6px; }
.pantry-alert-row { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 10px; border-left: 3px solid; border-radius: 4px; margin-bottom: 8px; background: var(--color-bg-subtle); }
.pantry-alert-critical { border-color: var(--color-destructive); }
.pantry-alert-warning { border-color: var(--color-warning, #d97706); }
.pantry-alert-info { border-color: var(--color-primary); }
.pantry-alert-info ul { margin: 4px 0 0; padding-left: 18px; font-size: 13px; }

.pantry-table-card { padding: 0; overflow: hidden; }
.pantry-table-wrap { overflow-x: auto; }
.pantry-table { width: 100%; border-collapse: collapse; }
.pantry-table th, .pantry-table td { padding: 10px 14px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--color-border); }
.pantry-table th { font-weight: 600; color: var(--color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; background: var(--color-bg-subtle); }
.pantry-table tbody tr:last-child td { border-bottom: none; }
.t-right { text-align: right; }
.pantry-row-name { font-weight: 500; margin-right: 6px; }
.pantry-muted { color: var(--color-text-muted); }
.pantry-row-actions { display: flex; gap: 4px; justify-content: flex-end; }

.pantry-status { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; }
.pantry-status-ok { color: var(--color-success, #16a34a); }
.pantry-status-warning { color: var(--color-warning, #d97706); }
.pantry-status-critical { color: var(--color-destructive); }

.pantry-empty { padding: 32px; text-align: center; }
.pantry-empty-icon { font-size: 48px; color: var(--color-primary); margin-bottom: 8px; }
.pantry-empty h3 { margin: 0 0 6px; font-size: 18px; }
.pantry-empty p { color: var(--color-text-muted); margin: 0 auto 12px; max-width: 380px; font-size: 14px; }

.pantry-restock-card { padding: 16px; }
.pantry-restock-card h3 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }

.pantry-form { display: flex; flex-direction: column; gap: 12px; }
.pantry-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pantry-form .ds-field { display: flex; flex-direction: column; gap: 4px; }
.pantry-form .ds-label { font-size: 13px; font-weight: 500; }

.pantry-spin { animation: pantry-spin 0.8s linear infinite; display: inline-block; }
@keyframes pantry-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 860px) {
  .pantry-kpis { grid-template-columns: repeat(2, 1fr); }
  .pantry-form-row { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .pantry-kpis { grid-template-columns: 1fr; }
}

/* Addon cell — toggle compatto + bottone gear con prezzo. */
.pantry-addon-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pantry-addon-switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}
.pantry-addon-switch input[type="checkbox"] {
  opacity: 0;
  width: 0;
  height: 0;
}
.pantry-addon-slider {
  position: absolute;
  inset: 0;
  background: var(--color-border, #ccc);
  border-radius: 999px;
  transition: background 160ms;
}
.pantry-addon-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 160ms;
}
.pantry-addon-switch input:checked + .pantry-addon-slider {
  background: var(--color-primary, var(--ac));
}
.pantry-addon-switch input:checked + .pantry-addon-slider::before {
  transform: translateX(14px);
}
.pantry-addon-config-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.pantry-addon-price {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary, var(--ac));
}
</style>

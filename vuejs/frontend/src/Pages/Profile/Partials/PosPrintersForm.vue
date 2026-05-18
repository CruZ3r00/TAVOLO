<script setup>
/**
 * Sezione "Configurazione stampanti" del profilo utente.
 *
 * Tre blocchi:
 *  1. Stampa automatica comande — toggle on/off.
 *  2. Stampanti di stazione — una card per cucina (sempre), bar/pizzeria/cucina_sg (solo pro).
 *  3. Dispositivi cassa/pagamento — lista dinamica con capability flag.
 *
 * Endpoint backend (Phase 1):
 *   GET  /api/restaurant-printer-config/me
 *   PUT  /api/restaurant-printer-config/me
 *   POST /api/restaurant-printer-config/test-print
 */

import { ref, computed, reactive, onMounted } from 'vue';
import { useStore } from 'vuex';
import { getPrinterConfig, savePrinterConfig, testPrint } from '@/lib/api/printers.js';
import { isProPlan } from '@/lib/plan.js';

const props = defineProps({
  currentUser: { type: Object, default: () => ({}) },
});

const store = useStore();
const token = store.getters.getToken;

// --- State ---
const loading = ref(true);
const saving = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const testingKeys = reactive({}); // { [role:key]: true }
const testResults = reactive({}); // { [role:key]: { ok, msg } }

// Config editable
const config = ref(defaultConfig());

function defaultConfig() {
  return {
    auto_print_kitchen_enabled: true,
    stations_json: {},
    cash_devices_json: [],
  };
}

// Computed
const isPro = computed(() => isProPlan(props.currentUser));
const serverPlan = ref('starter');

// --- Costanti driver ---
const STATION_DRIVERS = [
  { value: 'escpos-network', label: 'ESC/POS via rete (LAN)' },
  { value: 'escpos-fiscal', label: 'ESC/POS fiscale' },
  { value: 'epson-fpmate', label: 'Epson FP-Mate' },
  { value: 'custom-xon', label: 'Custom XON' },
  { value: 'italretail', label: 'Italretail (RT italiana)' },
  { value: 'stub', label: 'Simulatore (test)' },
];

const CASH_DRIVERS = [
  ...STATION_DRIVERS,
  { value: 'generic-ecr', label: 'ECR generico' },
  { value: 'jpos', label: 'jPOS' },
  { value: 'nexi-p17', label: 'Nexi P17 (POS)' },
  { value: 'escpos-bt', label: 'ESC/POS Bluetooth' },
];

// Stazioni
const ALL_STATIONS = [
  { key: 'cucina', label: 'Cucina', icon: 'bi-fire', proOnly: false },
  { key: 'bar', label: 'Bar', icon: 'bi-cup-straw', proOnly: true },
  { key: 'pizzeria', label: 'Pizzeria', icon: 'bi-record-circle', proOnly: true },
  { key: 'cucina_sg', label: 'Cucina senza glutine', icon: 'bi-shield-check', proOnly: true },
];

const visibleStations = computed(() =>
  ALL_STATIONS.filter((s) => !s.proOnly || isPro.value)
);

// Metodi pagamento
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Contanti' },
  { value: 'card', label: 'Carta' },
  { value: 'meal_voucher', label: 'Buoni pasto' },
  { value: 'other', label: 'Altro' },
];

// --- Helpers per stazione ---
function getStation(key) {
  const s = config.value.stations_json || {};
  return s[key] || { driver: '', host: '', port: 9100, enabled: false };
}

function setStationField(key, field, value) {
  if (!config.value.stations_json) config.value.stations_json = {};
  if (!config.value.stations_json[key]) {
    config.value.stations_json[key] = { driver: '', host: '', port: 9100, enabled: false };
  }
  config.value.stations_json[key][field] = value;
}

// --- Helpers per cash device ---
function addCashDevice() {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  config.value.cash_devices_json.push({
    id: id,
    label: '',
    driver: '',
    host: '',
    port: 9100,
    can_charge: false,
    can_print_receipt: false,
    can_print_fiscal: false,
    accepted_methods: [],
    enabled: false,
  });
}

function removeCashDevice(index) {
  config.value.cash_devices_json.splice(index, 1);
}

function toggleMethod(device, method) {
  const idx = device.accepted_methods.indexOf(method);
  if (idx >= 0) {
    device.accepted_methods.splice(idx, 1);
  } else {
    device.accepted_methods.push(method);
  }
}

// --- API ---
async function loadConfig() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data = await getPrinterConfig(token);
    config.value = {
      auto_print_kitchen_enabled: data.auto_print_kitchen_enabled !== false,
      stations_json: data.stations_json || {},
      cash_devices_json: Array.isArray(data.cash_devices_json) ? data.cash_devices_json : [],
    };
    serverPlan.value = data.plan || 'starter';
  } catch (err) {
    // 404 = prima configurazione, usa default
    if (err.status === 404) {
      config.value = defaultConfig();
    } else {
      errorMsg.value = err.message || 'Errore nel caricamento della configurazione stampanti.';
    }
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const payload = {
      auto_print_kitchen_enabled: config.value.auto_print_kitchen_enabled,
      stations_json: config.value.stations_json,
      cash_devices_json: config.value.cash_devices_json,
    };
    const data = await savePrinterConfig(payload, token);
    config.value = {
      auto_print_kitchen_enabled: data.auto_print_kitchen_enabled !== false,
      stations_json: data.stations_json || {},
      cash_devices_json: Array.isArray(data.cash_devices_json) ? data.cash_devices_json : [],
    };
    serverPlan.value = data.plan || serverPlan.value;
    successMsg.value = 'Configurazione stampanti salvata con successo.';
    setTimeout(() => { successMsg.value = ''; }, 4000);
  } catch (err) {
    if (err.code === 'INVALID_PAYLOAD' && err.message) {
      errorMsg.value = err.message;
    } else {
      errorMsg.value = 'Salvataggio fallito. Riprova.';
    }
  } finally {
    saving.value = false;
  }
}

function onCancel() {
  loadConfig();
}

async function onTestPrint(role, key) {
  const tk = role + ':' + key;
  testingKeys[tk] = true;
  delete testResults[tk];
  try {
    await testPrint({ role, key }, token);
    testResults[tk] = { ok: true, msg: 'Test inviato alla stampante.' };
  } catch (err) {
    testResults[tk] = {
      ok: false,
      msg: err.code === 'DEVICE_UNAVAILABLE'
        ? 'Nessun dispositivo POS/RT attivo. Verifica che il servizio sia in esecuzione e collegato.'
        : (err.message || 'Errore nel test di stampa.'),
    };
  } finally {
    testingKeys[tk] = false;
    setTimeout(() => { delete testResults[tk]; }, 5000);
  }
}

function canTestStation(key) {
  const s = getStation(key);
  return s.enabled && s.host && s.driver;
}

function canTestCash(device) {
  return device.enabled && device.host && device.driver;
}

onMounted(loadConfig);
</script>

<template>
  <div class="printers-section">
    <header class="section-head">
      <p class="text-overline">Configurazione</p>
      <h2 class="section-title">
        <i class="bi bi-printer"></i> Stampanti
      </h2>
      <p class="section-sub">
        Configura le stampanti per le comande di cucina e i dispositivi cassa per pagamenti e scontrini fiscali.
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="muted">Caricamento configurazione stampanti...</div>

    <template v-else>
      <!-- Global alerts -->
      <div v-if="errorMsg" class="alert alert-err">
        <i class="bi bi-exclamation-triangle"></i> {{ errorMsg }}
      </div>
      <div v-if="successMsg" class="alert alert-ok">
        <i class="bi bi-check-circle"></i> {{ successMsg }}
      </div>

      <!-- ========================================= -->
      <!-- 1. Stampa automatica comande              -->
      <!-- ========================================= -->
      <section class="card">
        <h3 class="card-title">
          <i class="bi bi-lightning-charge"></i> Stampa automatica comande
        </h3>
        <label class="toggle-row">
          <input
            type="checkbox"
            :checked="config.auto_print_kitchen_enabled"
            @change="config.auto_print_kitchen_enabled = $event.target.checked"
          />
          <span class="toggle-label">Abilita stampa automatica delle comande in cucina</span>
        </label>
        <p class="hint">
          Quando attiva, ogni "Invia in cucina" genera la comanda sulla stampante della stazione corrispondente.
        </p>
      </section>

      <!-- ========================================= -->
      <!-- 2. Stampanti di stazione                  -->
      <!-- ========================================= -->
      <section class="card">
        <h3 class="card-title">
          <i class="bi bi-printer"></i> Stampanti di stazione
        </h3>
        <p class="card-sub">
          Assegna una stampante a ciascun reparto. La comanda viene instradata automaticamente
          in base alla categoria del piatto.
        </p>

        <div class="stations-list">
          <div
            v-for="station in visibleStations"
            :key="station.key"
            class="station-card"
          >
            <div class="station-header">
              <i :class="['bi', station.icon, 'station-icon']"></i>
              <h4 class="station-name">{{ station.label }}</h4>
              <label class="toggle-inline" :title="'Abilita stampante ' + station.label">
                <input
                  type="checkbox"
                  :checked="getStation(station.key).enabled"
                  @change="setStationField(station.key, 'enabled', $event.target.checked)"
                  :aria-label="'Abilita stampante ' + station.label"
                />
                <span class="toggle-text">{{ getStation(station.key).enabled ? 'Attiva' : 'Disattiva' }}</span>
              </label>
            </div>

            <div class="station-fields">
              <div class="field-group">
                <label class="field-label">Driver</label>
                <select
                  class="field-input"
                  :value="getStation(station.key).driver"
                  @change="setStationField(station.key, 'driver', $event.target.value)"
                  :aria-label="'Driver stampante ' + station.label"
                >
                  <option value="">— Seleziona driver —</option>
                  <option
                    v-for="d in STATION_DRIVERS"
                    :key="d.value"
                    :value="d.value"
                  >{{ d.label }}</option>
                </select>
              </div>

              <div class="field-group">
                <label class="field-label">Host</label>
                <input
                  type="text"
                  class="field-input"
                  placeholder="192.168.1.x"
                  :value="getStation(station.key).host"
                  @input="setStationField(station.key, 'host', $event.target.value)"
                  :aria-label="'Indirizzo IP stampante ' + station.label"
                />
              </div>

              <div class="field-group field-group--small">
                <label class="field-label">Porta</label>
                <input
                  type="number"
                  class="field-input"
                  :value="getStation(station.key).port"
                  @input="setStationField(station.key, 'port', parseInt($event.target.value, 10) || 9100)"
                  :aria-label="'Porta stampante ' + station.label"
                />
              </div>

              <div class="field-group field-group--action">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="!canTestStation(station.key) || testingKeys['station:' + station.key]"
                  @click="onTestPrint('station', station.key)"
                >
                  <span v-if="testingKeys['station:' + station.key]" class="spinner"></span>
                  <template v-else>
                    <i class="bi bi-send"></i> Test stampa
                  </template>
                </button>
              </div>
            </div>

            <!-- Test result -->
            <div
              v-if="testResults['station:' + station.key]"
              class="test-result"
              :class="testResults['station:' + station.key].ok ? 'test-ok' : 'test-err'"
            >
              <i :class="testResults['station:' + station.key].ok ? 'bi bi-check-circle' : 'bi bi-x-circle'"></i>
              {{ testResults['station:' + station.key].msg }}
            </div>
          </div>
        </div>

        <!-- Banner starter upsell -->
        <div v-if="!isPro" class="upsell-banner">
          <div class="upsell-ico">
            <i class="bi bi-lock-fill"></i>
          </div>
          <div class="upsell-body">
            <h4>Stampanti per Bar, Pizzeria e Cucina senza glutine</h4>
            <p>
              Aggiorna al piano Professionale per configurare stampanti dedicate per ogni reparto.
              Con il piano Essenziale puoi configurare solo la stampante Cucina.
            </p>
            <router-link to="/renew-sub" class="btn btn-accent btn-sm">
              Scopri il piano Professionale <i class="bi bi-arrow-right"></i>
            </router-link>
          </div>
        </div>
      </section>

      <!-- ========================================= -->
      <!-- 3. Dispositivi cassa / pagamento          -->
      <!-- ========================================= -->
      <section class="card">
        <h3 class="card-title">
          <i class="bi bi-credit-card-2-front"></i> Dispositivi cassa / pagamento
        </h3>
        <p class="card-sub">
          Aggiungi e configura le postazioni cassa: terminali POS, casse fiscali, stampanti di scontrini.
          Ogni dispositivo puo' combinare piu' funzionalita'.
        </p>

        <div v-if="config.cash_devices_json.length === 0" class="empty-state">
          <i class="bi bi-inbox empty-ico"></i>
          <p>Nessun dispositivo cassa configurato.</p>
        </div>

        <div class="cash-list">
          <div
            v-for="(device, idx) in config.cash_devices_json"
            :key="device.id"
            class="cash-card"
          >
            <div class="cash-header">
              <h4 class="cash-label-title">Dispositivo {{ idx + 1 }}</h4>
              <div class="cash-header-actions">
                <label class="toggle-inline" :title="'Abilita dispositivo ' + (device.label || idx + 1)">
                  <input
                    type="checkbox"
                    v-model="device.enabled"
                    :aria-label="'Abilita dispositivo ' + (device.label || idx + 1)"
                  />
                  <span class="toggle-text">{{ device.enabled ? 'Attivo' : 'Disattivo' }}</span>
                </label>
                <button
                  type="button"
                  class="btn btn-danger btn-sm"
                  @click="removeCashDevice(idx)"
                  :aria-label="'Rimuovi dispositivo ' + (device.label || idx + 1)"
                >
                  <i class="bi bi-trash"></i> Rimuovi
                </button>
              </div>
            </div>

            <div class="cash-fields">
              <div class="field-group field-group--wide">
                <label class="field-label">Etichetta</label>
                <input
                  type="text"
                  class="field-input"
                  placeholder="Es. Cassa fiscale, POS terminale 1"
                  v-model="device.label"
                />
              </div>

              <div class="field-group">
                <label class="field-label">Driver</label>
                <select class="field-input" v-model="device.driver">
                  <option value="">— Seleziona driver —</option>
                  <option
                    v-for="d in CASH_DRIVERS"
                    :key="d.value"
                    :value="d.value"
                  >{{ d.label }}</option>
                </select>
              </div>

              <div class="field-group">
                <label class="field-label">Host</label>
                <input
                  type="text"
                  class="field-input"
                  placeholder="192.168.1.x"
                  v-model="device.host"
                />
              </div>

              <div class="field-group field-group--small">
                <label class="field-label">Porta</label>
                <input
                  type="number"
                  class="field-input"
                  v-model.number="device.port"
                />
              </div>
            </div>

            <!-- Capability -->
            <div class="cash-capabilities">
              <p class="caps-label">Funzionalita'</p>
              <div class="caps-row">
                <label class="cap-check">
                  <input type="checkbox" v-model="device.can_charge" />
                  <span>Accetta pagamenti</span>
                </label>
                <label class="cap-check">
                  <input type="checkbox" v-model="device.can_print_receipt" />
                  <span>Stampa ricevuta</span>
                </label>
                <label class="cap-check">
                  <input type="checkbox" v-model="device.can_print_fiscal" />
                  <span>Stampa scontrino fiscale</span>
                </label>
              </div>
            </div>

            <!-- Metodi pagamento -->
            <div class="cash-methods">
              <p class="caps-label">Metodi di pagamento accettati</p>
              <div class="caps-row">
                <label
                  v-for="pm in PAYMENT_METHODS"
                  :key="pm.value"
                  class="cap-check"
                >
                  <input
                    type="checkbox"
                    :checked="device.accepted_methods && device.accepted_methods.includes(pm.value)"
                    @change="toggleMethod(device, pm.value)"
                  />
                  <span>{{ pm.label }}</span>
                </label>
              </div>
            </div>

            <!-- Test + result -->
            <div class="cash-actions">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="!canTestCash(device) || testingKeys['cash:' + device.id]"
                @click="onTestPrint('cash', device.id)"
              >
                <span v-if="testingKeys['cash:' + device.id]" class="spinner"></span>
                <template v-else>
                  <i class="bi bi-send"></i> Test stampa
                </template>
              </button>
            </div>
            <div
              v-if="testResults['cash:' + device.id]"
              class="test-result"
              :class="testResults['cash:' + device.id].ok ? 'test-ok' : 'test-err'"
            >
              <i :class="testResults['cash:' + device.id].ok ? 'bi bi-check-circle' : 'bi bi-x-circle'"></i>
              {{ testResults['cash:' + device.id].msg }}
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-ghost add-device-btn" @click="addCashDevice">
          <i class="bi bi-plus-lg"></i> Aggiungi dispositivo cassa
        </button>
      </section>

      <!-- ========================================= -->
      <!-- Footer: Salva / Annulla                   -->
      <!-- ========================================= -->
      <div class="form-footer">
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="saving"
          @click="onCancel"
        >
          Annulla
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving"
          @click="onSave"
        >
          <span v-if="saving" class="spinner"></span>
          <template v-else>
            <i class="bi bi-check2"></i> Salva configurazione
          </template>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.printers-section { display: flex; flex-direction: column; gap: var(--s-6, 1.25rem); }
.section-head { margin-bottom: var(--s-4, 0.75rem); }
.text-overline {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--ink-3); margin: 0 0 6px;
}
.section-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(22px, 2.4vw, 28px); font-weight: 700; color: var(--ink);
  margin: 0 0 8px; letter-spacing: -0.01em;
  display: flex; align-items: center; gap: 0.5rem;
}
.section-title i { color: var(--ac); }
.section-sub { color: var(--ink-2); margin: 0; line-height: 1.55; }

.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg, 12px);
  padding: var(--s-6, 1.25rem);
}
.card-title {
  display: flex; align-items: center; gap: 0.6rem;
  margin: 0 0 0.4rem; font-size: 1.05rem; font-weight: 600; color: var(--ink);
}
.card-title i { font-size: 1.2rem; color: var(--ac); }
.card-sub { color: var(--ink-2); margin: 0 0 1rem; font-size: 0.95rem; }

.muted { color: var(--ink-3); font-size: 0.9rem; padding: 0.5rem 0; }

.alert {
  padding: 0.65rem 0.85rem; border-radius: var(--r-sm, 8px);
  font-size: 0.9rem; margin-bottom: 0.75rem;
  display: flex; align-items: center; gap: 0.5rem;
}
.alert-err {
  background: color-mix(in oklab, var(--dan) 12%, transparent);
  border: 1px solid color-mix(in oklab, var(--dan) 35%, transparent);
  color: var(--dan);
}
.alert-ok {
  background: color-mix(in oklab, var(--ac) 12%, transparent);
  border: 1px solid color-mix(in oklab, var(--ac) 35%, transparent);
  color: var(--ac);
}

/* Toggle row */
.toggle-row {
  display: flex; align-items: center; gap: 0.75rem;
  cursor: pointer; padding: 0.25rem 0;
}
.toggle-row input[type="checkbox"] {
  width: 18px; height: 18px; accent-color: var(--ac);
  cursor: pointer;
}
.toggle-label { font-size: 0.95rem; color: var(--ink); font-weight: 500; }
.hint {
  margin: 0.35rem 0 0;
  font-size: 0.85rem; color: var(--ink-3); line-height: 1.5;
}

/* Stations */
.stations-list {
  display: flex; flex-direction: column; gap: 0.85rem;
}
.station-card {
  border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px);
  padding: 1rem;
  background: var(--bg, transparent);
}
.station-header {
  display: flex; align-items: center; gap: 0.6rem;
  margin-bottom: 0.75rem;
}
.station-icon { font-size: 1.15rem; color: var(--ac); }
.station-name {
  margin: 0; font-size: 1rem; font-weight: 600; color: var(--ink);
  flex: 1;
}
.toggle-inline {
  display: flex; align-items: center; gap: 0.4rem; cursor: pointer;
  font-size: 0.85rem; color: var(--ink-2);
}
.toggle-inline input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: var(--ac);
  cursor: pointer;
}
.toggle-text { user-select: none; }

.station-fields {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  align-items: flex-end;
}

.field-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 150px; }
.field-group--small { flex: 0 0 90px; min-width: 90px; }
.field-group--wide { flex: 2; min-width: 200px; }
.field-group--action { flex: 0 0 auto; min-width: auto; }
.field-label {
  font-size: 0.8rem; font-weight: 500; color: var(--ink-2);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.field-input {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--f-sans, sans-serif);
  font-size: 0.9rem;
}
.field-input:focus {
  outline: none;
  border-color: var(--ac);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ac) 18%, transparent);
}
select.field-input { cursor: pointer; }

/* Test result */
.test-result {
  margin-top: 0.5rem;
  padding: 0.4rem 0.65rem;
  border-radius: var(--r-sm, 8px);
  font-size: 0.85rem;
  display: flex; align-items: center; gap: 0.4rem;
}
.test-ok {
  background: color-mix(in oklab, var(--ac) 10%, transparent);
  color: var(--ac);
}
.test-err {
  background: color-mix(in oklab, var(--dan) 10%, transparent);
  color: var(--dan);
}

/* Upsell banner */
.upsell-banner {
  display: flex; gap: 1rem; align-items: flex-start;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-sm, 8px);
  background: color-mix(in oklab, var(--ac) 4%, transparent);
}
.upsell-ico {
  font-size: 1.5rem; color: var(--ink-3); flex-shrink: 0;
}
.upsell-body h4 {
  margin: 0 0 0.35rem; font-size: 0.95rem; font-weight: 600; color: var(--ink);
}
.upsell-body p {
  margin: 0 0 0.75rem; font-size: 0.88rem; color: var(--ink-2); line-height: 1.5;
}

/* Cash devices */
.cash-list {
  display: flex; flex-direction: column; gap: 0.85rem;
  margin-bottom: 1rem;
}
.cash-card {
  border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px);
  padding: 1rem;
  background: var(--bg, transparent);
}
.cash-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem; margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.cash-label-title {
  margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--ink);
}
.cash-header-actions {
  display: flex; align-items: center; gap: 0.75rem;
}
.cash-fields {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  margin-bottom: 0.75rem;
}

/* Capabilities */
.cash-capabilities,
.cash-methods { margin-bottom: 0.65rem; }
.caps-label {
  font-size: 0.8rem; font-weight: 500; color: var(--ink-2);
  text-transform: uppercase; letter-spacing: 0.04em;
  margin: 0 0 0.4rem;
}
.caps-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.cap-check {
  display: flex; align-items: center; gap: 0.35rem;
  font-size: 0.9rem; color: var(--ink); cursor: pointer;
}
.cap-check input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: var(--ac); cursor: pointer;
}

.cash-actions {
  display: flex; gap: 0.5rem;
  margin-top: 0.5rem;
}

.add-device-btn {
  width: 100%;
  border-style: dashed;
}

/* Empty state */
.empty-state {
  text-align: center; padding: 1.5rem 1rem; color: var(--ink-3);
}
.empty-ico { font-size: 2rem; opacity: 0.4; }
.empty-state p { margin: 0.5rem 0 0; font-size: 0.9rem; }

/* Form footer */
.form-footer {
  display: flex; justify-content: flex-end; gap: 0.75rem;
  padding-top: 0.5rem;
}

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  padding: 0.55rem 1rem; border-radius: var(--r-sm, 8px);
  font-family: var(--f-sans, sans-serif); font-size: 0.9rem; font-weight: 500;
  border: 1px solid transparent; cursor: pointer; text-decoration: none;
  transition: background 120ms, border-color 120ms;
}
.btn-primary { background: var(--ac); color: var(--paper, #fff); }
.btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.btn-ghost { background: transparent; color: var(--ink-2); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink); }
.btn-accent { background: var(--ac); color: var(--paper, #fff); }
.btn-danger { background: var(--dan); color: #fff; }
.btn-sm { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
.btn:disabled { opacity: 0.6; cursor: wait; }

/* Spinner */
.spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 600px) {
  .station-fields { flex-direction: column; }
  .field-group--small { flex: 1 1 100%; }
  .cash-fields { flex-direction: column; }
  .cash-header { flex-direction: column; align-items: flex-start; }
  .upsell-banner { flex-direction: column; }
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { devicePersistence, type DriverConfig } from '../core/persistence';
import { driverRegistry } from '../drivers/registry';
import { tcpAvailable } from '../plugins/tcpSocket';

const router = useRouter();

const PRINTER_OPTIONS = [
  { value: 'stub', label: 'Stub (test)' },
  { value: 'italretail', label: 'Italretail (Italstart / Nice / Big)' },
  { value: 'epson-fpmate', label: 'Epson FPMate (FP-90III, FP-81II)' },
  { value: 'custom-xon', label: 'Custom XON (Q3X, Big, K3)' },
  { value: 'escpos-fiscal', label: 'ESC/POS-fiscal generico' },
];
const PAYMENT_OPTIONS = [
  { value: 'stub', label: 'Stub (test)' },
  { value: 'nexi-p17', label: 'Nexi POS — Protocollo 17 / ECR17 (LAN)' },
  { value: 'generic-ecr', label: 'Generic ECR / OPI XML (LAN)' },
  { value: 'jpos', label: 'JPOS / ISO-8583 (LAN)' },
  { value: 'escpos-bt', label: 'ESC/POS-BT (Bluetooth) [non ancora implementato]' },
];

const cfg = ref<DriverConfig>({
  printer: { name: 'stub', options: {} },
  payment: { name: 'stub', options: {} },
});
const pollInterval = ref<number>(10);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const printerNeedsHost = computed(() =>
  ['epson-fpmate', 'custom-xon', 'escpos-fiscal', 'italretail'].includes(cfg.value.printer.name),
);
const paymentNeedsHost = computed(() =>
  ['generic-ecr', 'jpos', 'nexi-p17'].includes(cfg.value.payment.name),
);
const requiresTcp = computed(
  () =>
    ['custom-xon', 'escpos-fiscal', 'italretail'].includes(cfg.value.printer.name) ||
    ['generic-ecr', 'jpos', 'nexi-p17'].includes(cfg.value.payment.name),
);
const defaultPaymentPort = computed(() => {
  switch (cfg.value.payment.name) {
    case 'generic-ecr': return 6000;
    case 'jpos': return 9000;
    case 'nexi-p17': return 9999;
    default: return 9000;
  }
});
const tcpReady = ref(true);
const driverStatus = ref<{ printer: any; payment: any } | null>(null);
let statusTimer: any = null;

async function refreshStatus(): Promise<void> {
  try {
    driverStatus.value = await driverRegistry.status();
  } catch (_) {
    /* non bloccante */
  }
}

onMounted(async () => {
  cfg.value = await devicePersistence.getDrivers();
  pollInterval.value = await devicePersistence.getPollInterval();
  tcpReady.value = tcpAvailable();
  refreshStatus();
  statusTimer = setInterval(refreshStatus, 5_000);
});
onUnmounted(() => { if (statusTimer) clearInterval(statusTimer); });

function goDiscovery(): void {
  router.push('/discovery');
}

function setOpt(target: 'printer' | 'payment', key: string, value: any) {
  cfg.value[target].options = { ...cfg.value[target].options, [key]: value };
}

async function save() {
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    await devicePersistence.setDrivers(cfg.value);
    await devicePersistence.setPollInterval(pollInterval.value);
    await driverRegistry.reload();
    message.value = 'Configurazione salvata. Il polling userà i nuovi driver al prossimo tick.';
  } catch (err: any) {
    error.value = err?.message || 'Salvataggio fallito';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <h1>Impostazioni</h1>

    <div v-if="requiresTcp && !tcpReady" class="error">
      Il driver selezionato richiede il plugin TCP nativo. Sui build web non è
      disponibile: usa l'app Android/iOS reale.
    </div>

    <div class="card">
      <h2>Stato driver</h2>
      <div class="kv">
        <span class="k">Cassa / RT</span>
        <span class="v">
          {{ driverStatus?.printer?.name || cfg.printer.name }}
          <span class="badge" :class="driverStatus?.printer?.online ? 'ok' : 'err'">
            {{ driverStatus?.printer?.online ? 'online' : 'offline' }}
          </span>
        </span>
      </div>
      <div v-if="driverStatus?.printer?.error" class="muted small">{{ driverStatus.printer.error }}</div>
      <div class="kv">
        <span class="k">POS</span>
        <span class="v">
          {{ driverStatus?.payment?.name || cfg.payment.name }}
          <span class="badge" :class="driverStatus?.payment?.online ? 'ok' : 'err'">
            {{ driverStatus?.payment?.online ? 'online' : 'offline' }}
          </span>
        </span>
      </div>
      <div v-if="driverStatus?.payment?.error" class="muted small">{{ driverStatus.payment.error }}</div>

      <button class="btn btn-block" style="margin-top: 0.6rem;" @click="goDiscovery">
        🔎 Cerca dispositivi sulla rete locale
      </button>
    </div>

    <div class="card">
      <h2>Cassa fiscale (RT)</h2>
      <label>Driver</label>
      <select v-model="cfg.printer.name">
        <option v-for="o in PRINTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <template v-if="printerNeedsHost">
        <label>Host (IP)</label>
        <input
          type="text"
          :value="(cfg.printer.options as any).host || ''"
          @input="setOpt('printer', 'host', ($event.target as HTMLInputElement).value)"
          placeholder="192.168.1.100"
        />

        <label>Porta</label>
        <input
          type="number"
          :value="(cfg.printer.options as any).port || (cfg.printer.name === 'epson-fpmate' ? 80 : 9100)"
          @input="setOpt('printer', 'port', Number(($event.target as HTMLInputElement).value))"
        />

        <template v-if="cfg.printer.name === 'epson-fpmate'">
          <label>Username (opzionale)</label>
          <input
            type="text"
            :value="(cfg.printer.options as any).username || ''"
            @input="setOpt('printer', 'username', ($event.target as HTMLInputElement).value)"
          />
          <label>Password (opzionale)</label>
          <input
            type="password"
            :value="(cfg.printer.options as any).password || ''"
            @input="setOpt('printer', 'password', ($event.target as HTMLInputElement).value)"
          />
        </template>
      </template>
    </div>

    <div class="card">
      <h2>Terminale POS</h2>
      <label>Driver</label>
      <select v-model="cfg.payment.name">
        <option v-for="o in PAYMENT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <template v-if="paymentNeedsHost">
        <label>Host (IP)</label>
        <input
          type="text"
          :value="(cfg.payment.options as any).host || ''"
          @input="setOpt('payment', 'host', ($event.target as HTMLInputElement).value)"
          placeholder="192.168.1.50"
        />

        <label>Porta</label>
        <input
          type="number"
          :value="(cfg.payment.options as any).port || defaultPaymentPort"
          @input="setOpt('payment', 'port', Number(($event.target as HTMLInputElement).value))"
        />

        <template v-if="cfg.payment.name === 'jpos'">
          <label>Terminal ID</label>
          <input
            type="text"
            :value="(cfg.payment.options as any).terminalId || 'POS00001'"
            @input="setOpt('payment', 'terminalId', ($event.target as HTMLInputElement).value)"
          />
        </template>

        <template v-if="cfg.payment.name === 'nexi-p17'">
          <label>Terminal ID</label>
          <input
            type="text"
            :value="(cfg.payment.options as any).terminalId || 'TID00001'"
            @input="setOpt('payment', 'terminalId', ($event.target as HTMLInputElement).value)"
          />
          <label>Workstation ID</label>
          <input
            type="text"
            :value="(cfg.payment.options as any).workstationId || 'POS01'"
            @input="setOpt('payment', 'workstationId', ($event.target as HTMLInputElement).value)"
          />
          <p class="muted">
            La porta TCP del terminale Nexi è configurata caso per caso dal merchant team
            (tipicamente 9999 su Linux EFTPOS). Verifica con Nexi prima dell'attivazione.
          </p>
        </template>
      </template>
    </div>

    <div class="card">
      <h2>Polling</h2>
      <label>Intervallo (secondi, min 5)</label>
      <input v-model.number="pollInterval" type="number" min="5" max="120" />
      <p class="muted">
        Default: 10s. Su iOS in background il polling è triggerato dalle silent push APNs (non da
        questo intervallo).
      </p>
    </div>

    <div v-if="message" class="success-box">{{ message }}</div>
    <div v-if="error" class="error">{{ error }}</div>

    <button class="btn btn-block" @click="save" :disabled="saving">
      {{ saving ? 'Salvataggio…' : 'Salva configurazione' }}
    </button>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { devicePersistence, type DriverConfig } from '../core/persistence';
import { driverRegistry } from '../drivers/registry';
import { tcpAvailable } from '../plugins/tcpSocket';

const PRINTER_OPTIONS = [
  { value: 'stub', label: 'Stub (test)' },
  { value: 'epson-fpmate', label: 'Epson FPMate (FP-90III, FP-81II)' },
  { value: 'custom-xon', label: 'Custom XON (Q3X, Big, K3)' },
  { value: 'escpos-fiscal', label: 'ESC/POS-fiscal generico' },
];
const PAYMENT_OPTIONS = [
  { value: 'stub', label: 'Stub (test)' },
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
  ['epson-fpmate', 'custom-xon', 'escpos-fiscal'].includes(cfg.value.printer.name),
);
const paymentNeedsHost = computed(() => ['generic-ecr', 'jpos'].includes(cfg.value.payment.name));
const requiresTcp = computed(
  () =>
    ['custom-xon', 'escpos-fiscal'].includes(cfg.value.printer.name) ||
    ['generic-ecr', 'jpos'].includes(cfg.value.payment.name),
);
const tcpReady = ref(true);

onMounted(async () => {
  cfg.value = await devicePersistence.getDrivers();
  pollInterval.value = await devicePersistence.getPollInterval();
  tcpReady.value = tcpAvailable();
});

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
          :value="(cfg.payment.options as any).port || (cfg.payment.name === 'generic-ecr' ? 6000 : 9000)"
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

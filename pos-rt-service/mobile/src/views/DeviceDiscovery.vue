<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDiscovery } from '../composables/useDiscovery';
import { useDriverConfig } from '../composables/useDriverConfig';
import { networkInfoAvailable } from '../plugins/networkInfo';
import { tcpAvailable } from '../plugins/tcpSocket';
import type { DiscoveredDevice } from '../services/discovery/deviceDiscovery';
import type { DriverCandidate } from '../services/discovery/driverProbes';

const router = useRouter();
const { scanning, progress, done, total, phase, subnet, devices, errorMsg, start, cancel } = useDiscovery();
const { applyDiscovered, message: applyMsg, errorMsg: applyErr } = useDriverConfig();

const tcpReady = tcpAvailable();
const netReady = networkInfoAvailable();

onMounted(() => {
  /* lo scan parte solo on-demand: l'utente preme "Cerca" */
});

const printerDevices = computed(() =>
  devices.value.filter((d) => d.bestCandidate?.kind === 'printer'),
);
const paymentDevices = computed(() =>
  devices.value.filter((d) => d.bestCandidate?.kind === 'payment'),
);
const otherDevices = computed(() =>
  devices.value.filter((d) => !d.bestCandidate || d.candidates.length === 0),
);

async function pickAndSave(d: DiscoveredDevice, c: DriverCandidate): Promise<void> {
  await applyDiscovered(d.host, d.port, c);
}

function back(): void {
  router.push('/settings');
}

function confidenceLabel(n: number): string {
  if (n >= 0.7) return 'alta';
  if (n >= 0.45) return 'media';
  return 'bassa';
}
</script>

<template>
  <div class="discovery-page">
    <div class="header">
      <button class="btn ghost small" @click="back">‹ Impostazioni</button>
      <h1>Cerca dispositivi</h1>
    </div>

    <div v-if="!netReady || !tcpReady" class="error">
      Plugin nativo non disponibile. La ricerca dispositivi richiede l'app Android reale (build via <code>cap run android</code>), non funziona nella build web.
    </div>

    <div class="card">
      <h2>Stato</h2>
      <div class="kv"><span class="k">Subnet</span>
        <span class="v">{{ subnet?.present ? `${subnet.ipv4}/${subnet.cidr}` : 'non rilevata' }}</span>
      </div>
      <div class="kv"><span class="k">Sorgente</span><span class="v">{{ subnet?.source || '-' }}</span></div>
      <div v-if="subnet?.gateway" class="kv"><span class="k">Gateway</span><span class="v">{{ subnet.gateway }}</span></div>
      <div class="kv"><span class="k">Fase</span><span class="v">{{ phase }}</span></div>
      <div v-if="scanning && total > 0" class="kv">
        <span class="k">Avanzamento</span>
        <span class="v">{{ done }} / {{ total }} ({{ progress }}%)</span>
      </div>
      <div v-if="scanning" class="bar"><div class="bar-fill" :style="{ width: progress + '%' }"></div></div>
    </div>

    <div class="row" style="gap: 0.5rem;">
      <button class="btn primary" @click="start" :disabled="scanning">
        {{ scanning ? 'Scansione…' : 'Cerca dispositivi' }}
      </button>
      <button class="btn danger small" @click="cancel" v-if="scanning">Annulla</button>
    </div>

    <div v-if="errorMsg" class="error" style="margin-top: 0.5rem;">{{ errorMsg }}</div>
    <div v-if="applyMsg" class="success-box" style="margin-top: 0.5rem;">{{ applyMsg }}</div>
    <div v-if="applyErr" class="error" style="margin-top: 0.5rem;">{{ applyErr }}</div>

    <section v-if="paymentDevices.length > 0" class="card">
      <h2>Terminali POS rilevati ({{ paymentDevices.length }})</h2>
      <div v-for="d in paymentDevices" :key="`${d.host}:${d.port}`" class="device">
        <div class="device-head">
          <strong>{{ d.host }}:{{ d.port }}</strong>
          <span class="muted small">{{ d.latencyMs }}ms</span>
        </div>
        <div v-if="d.bestCandidate" class="device-body">
          <span class="badge ok">{{ d.bestCandidate.driver }}</span>
          <span class="muted small">confidenza {{ confidenceLabel(d.bestCandidate.confidence) }}</span>
          <span v-if="d.bestCandidate.hint" class="muted small">— {{ d.bestCandidate.hint }}</span>
        </div>
        <div class="device-actions">
          <button class="btn small" v-for="c in d.candidates" :key="c.driver" @click="pickAndSave(d, c)">
            Imposta come "{{ c.driver }}"
          </button>
        </div>
      </div>
    </section>

    <section v-if="printerDevices.length > 0" class="card">
      <h2>Casse fiscali / stampanti rilevate ({{ printerDevices.length }})</h2>
      <div v-for="d in printerDevices" :key="`${d.host}:${d.port}`" class="device">
        <div class="device-head">
          <strong>{{ d.host }}:{{ d.port }}</strong>
          <span class="muted small">{{ d.latencyMs }}ms</span>
        </div>
        <div v-if="d.bestCandidate" class="device-body">
          <span class="badge ok">{{ d.bestCandidate.driver }}</span>
          <span class="muted small">confidenza {{ confidenceLabel(d.bestCandidate.confidence) }}</span>
          <span v-if="d.bestCandidate.hint" class="muted small">— {{ d.bestCandidate.hint }}</span>
        </div>
        <div class="device-actions">
          <button class="btn small" v-for="c in d.candidates" :key="c.driver" @click="pickAndSave(d, c)">
            Imposta come "{{ c.driver }}"
          </button>
        </div>
      </div>
    </section>

    <section v-if="otherDevices.length > 0" class="card">
      <h2>Altre porte aperte ({{ otherDevices.length }})</h2>
      <div v-for="d in otherDevices" :key="`${d.host}:${d.port}`" class="device">
        <div class="device-head">
          <strong>{{ d.host }}:{{ d.port }}</strong>
          <span class="muted small">{{ d.latencyMs }}ms</span>
        </div>
        <div v-if="d.hint" class="muted small">{{ d.hint }}</div>
      </div>
    </section>

    <div v-if="!scanning && devices.length === 0 && phase === 'done'" class="muted" style="margin-top: 1rem; text-align: center;">
      Nessun dispositivo POS o cassa rilevato sulla rete locale. Verifica che il device sia acceso, sulla stessa Wi-Fi, e prova a configurare manualmente da Impostazioni.
    </div>
  </div>
</template>

<style scoped>
.discovery-page { max-width: 700px; margin: 0 auto; }
.header { display: flex; align-items: center; gap: 0.5rem; }
.bar { background: var(--border); height: 6px; border-radius: 3px; overflow: hidden; margin-top: 0.5rem; }
.bar-fill { background: var(--accent); height: 100%; transition: width 0.2s; }
.device { padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
.device:last-child { border-bottom: none; }
.device-head { display: flex; justify-content: space-between; align-items: center; }
.device-body { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; margin-top: 0.2rem; }
.device-actions { margin-top: 0.4rem; display: flex; gap: 0.4rem; flex-wrap: wrap; }
.btn.small { padding: 0.25rem 0.6rem; font-size: 0.85rem; }
.muted.small { font-size: 0.8rem; }
.row { display: flex; }
</style>

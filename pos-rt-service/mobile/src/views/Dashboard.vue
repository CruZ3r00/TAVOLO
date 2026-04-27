<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { devicePersistence, type DeviceRecord } from '../core/persistence';
import { driverRegistry } from '../drivers/registry';
import { auditLog, type AuditEntry } from '../core/auditLog';
import * as scheduler from '../core/scheduler';
import { unpair } from '../core/pairing';

const router = useRouter();
const device = ref<DeviceRecord | null>(null);
const platform = ref<string>('other');
const driverStatus = ref<{ printer: any; payment: any } | null>(null);
const audit = ref<AuditEntry[]>([]);
const auditCount = ref(0);
const running = ref(false);
const refreshing = ref(false);
const errorMsg = ref<string | null>(null);

let timer: any = null;

async function refresh() {
  refreshing.value = true;
  errorMsg.value = null;
  try {
    device.value = await devicePersistence.get();
    platform.value = await devicePersistence.getPlatform();
    driverStatus.value = await driverRegistry.status();
    audit.value = await auditLog.tail(20);
    auditCount.value = await auditLog.count();
    running.value = scheduler.isRunning();
  } catch (err: any) {
    errorMsg.value = err?.message || 'Errore aggiornamento dashboard';
  } finally {
    refreshing.value = false;
  }
}

async function startScheduler() {
  await scheduler.start();
  await refresh();
}

function stopScheduler() {
  scheduler.stop();
  running.value = false;
}

async function pollNow() {
  refreshing.value = true;
  await scheduler.wakeAndSyncOnce();
  await refresh();
}

async function onUnpair() {
  if (!confirm('Unpair: il device verrà scollegato da Strapi. Confermi?')) return;
  scheduler.stop();
  await unpair();
  router.replace('/pair');
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

onMounted(() => {
  refresh();
  if (!scheduler.isRunning()) startScheduler();
  timer = setInterval(refresh, 5_000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="dashboard-page">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Dashboard</h1>
      <button class="btn ghost" @click="pollNow" :disabled="refreshing">
        {{ refreshing ? '…' : 'Sync' }}
      </button>
    </div>

    <div v-if="errorMsg" class="error">{{ errorMsg }}</div>

    <div class="card">
      <h2>Dispositivo</h2>
      <div class="kv"><span class="k">Nome</span><span class="v">{{ device?.name ?? '-' }}</span></div>
      <div class="kv"><span class="k">Strapi</span><span class="v">{{ device?.strapiUrl ?? '-' }}</span></div>
      <div class="kv"><span class="k">Platform</span><span class="v">{{ platform }}</span></div>
      <div class="kv">
        <span class="k">Polling</span>
        <span class="v">
          <span class="badge" :class="running ? 'ok' : 'err'">
            {{ running ? 'attivo' : 'fermo' }}
          </span>
        </span>
      </div>
    </div>

    <div class="card">
      <h2>Driver</h2>
      <div class="kv">
        <span class="k">Printer/RT</span>
        <span class="v">
          {{ driverStatus?.printer?.name }}
          <span class="badge" :class="driverStatus?.printer?.online ? 'ok' : 'err'">
            {{ driverStatus?.printer?.online ? 'online' : 'offline' }}
          </span>
        </span>
      </div>
      <div v-if="driverStatus?.printer?.error" class="muted" style="font-size: 0.8rem;">
        {{ driverStatus.printer.error }}
      </div>

      <div class="kv">
        <span class="k">Payment/POS</span>
        <span class="v">
          {{ driverStatus?.payment?.name }}
          <span class="badge" :class="driverStatus?.payment?.online ? 'ok' : 'err'">
            {{ driverStatus?.payment?.online ? 'online' : 'offline' }}
          </span>
        </span>
      </div>
      <div v-if="driverStatus?.payment?.error" class="muted" style="font-size: 0.8rem;">
        {{ driverStatus.payment.error }}
      </div>
    </div>

    <div class="card">
      <h2>Audit ({{ auditCount }})</h2>
      <div v-if="audit.length === 0" class="muted">Nessun evento registrato.</div>
      <div v-else>
        <div v-for="(e, i) in audit" :key="i" class="kv">
          <span class="k">{{ formatTime(e.ts) }}</span>
          <span class="v">{{ e.kind }}</span>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top: 1rem;">
      <button v-if="!running" class="btn" @click="startScheduler">Avvia polling</button>
      <button v-else class="btn ghost" @click="stopScheduler">Ferma polling</button>
      <button class="btn danger" @click="onUnpair">Unpair</button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page { max-width: 600px; margin: 0 auto; }
</style>

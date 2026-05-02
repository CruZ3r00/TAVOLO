/**
 * useDiscovery — composable Vue 3 per la LAN device discovery.
 *
 * Espone stato reattivo + funzioni `start/cancel`. Wraps `deviceDiscovery`
 * service: il composable si occupa solo della reattività, niente logica
 * di rete (pura UI bridge, riusabile da più viste).
 */

import { ref, computed, type Ref } from 'vue';
import { discoverDevices, type DiscoveredDevice, type DiscoveryReport } from '../services/discovery/deviceDiscovery';
import type { SubnetInfo } from '../services/discovery/networkInfo';

export interface UseDiscoveryReturn {
  scanning: Ref<boolean>;
  progress: Ref<number>; // 0..100
  done: Ref<number>;
  total: Ref<number>;
  phase: Ref<string>;
  subnet: Ref<SubnetInfo | null>;
  devices: Ref<DiscoveredDevice[]>;
  lastReport: Ref<DiscoveryReport | null>;
  errorMsg: Ref<string | null>;
  start(): Promise<void>;
  cancel(): void;
  reset(): void;
}

export function useDiscovery(): UseDiscoveryReturn {
  const scanning = ref(false);
  const done = ref(0);
  const total = ref(0);
  const phase = ref('idle');
  const subnet = ref<SubnetInfo | null>(null);
  const devices = ref<DiscoveredDevice[]>([]);
  const lastReport = ref<DiscoveryReport | null>(null);
  const errorMsg = ref<string | null>(null);
  let abortCtrl: AbortController | null = null;

  const progress = computed(() => (total.value > 0 ? Math.round((done.value / total.value) * 100) : 0));

  function reset(): void {
    devices.value = [];
    lastReport.value = null;
    done.value = 0;
    total.value = 0;
    phase.value = 'idle';
    errorMsg.value = null;
  }

  async function start(): Promise<void> {
    if (scanning.value) return;
    reset();
    scanning.value = true;
    abortCtrl = new AbortController();
    try {
      const report = await discoverDevices({
        signal: abortCtrl.signal,
        onPhase: (p, _meta) => {
          phase.value = p;
        },
        onProgress: (d, t) => {
          done.value = d;
          total.value = t;
        },
        onDevice: (d) => {
          devices.value = [...devices.value, d];
        },
      });
      lastReport.value = report;
      subnet.value = report.subnet;
    } catch (err: any) {
      errorMsg.value = err?.message || 'Errore discovery';
    } finally {
      scanning.value = false;
      abortCtrl = null;
    }
  }

  function cancel(): void {
    abortCtrl?.abort();
  }

  return { scanning, progress, done, total, phase, subnet, devices, lastReport, errorMsg, start, cancel, reset };
}

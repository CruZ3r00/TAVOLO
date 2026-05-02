/**
 * useDriverConfig — composable Vue per leggere/salvare la config driver
 * e per applicare un dispositivo scoperto come default.
 *
 * Mantiene un layer sottile sopra `devicePersistence` + `driverRegistry`,
 * così `Settings.vue` e `DeviceDiscovery.vue` riusano lo stesso flow.
 */

import { ref, type Ref } from 'vue';
import { devicePersistence, type DriverConfig } from '../core/persistence';
import { driverRegistry } from '../drivers/registry';
import type { DriverCandidate } from '../services/discovery/driverProbes';

export interface UseDriverConfigReturn {
  cfg: Ref<DriverConfig>;
  saving: Ref<boolean>;
  message: Ref<string | null>;
  errorMsg: Ref<string | null>;
  load(): Promise<void>;
  save(): Promise<void>;
  applyDiscovered(host: string, port: number, candidate: DriverCandidate): Promise<void>;
  testConnection(kind: 'printer' | 'payment'): Promise<{ online: boolean; latencyMs?: number; error?: string; raw?: any }>;
}

const DEFAULT_CFG: DriverConfig = {
  printer: { name: 'stub', options: {} },
  payment: { name: 'stub', options: {} },
};

export function useDriverConfig(): UseDriverConfigReturn {
  const cfg = ref<DriverConfig>({ ...DEFAULT_CFG });
  const saving = ref(false);
  const message = ref<string | null>(null);
  const errorMsg = ref<string | null>(null);

  async function load(): Promise<void> {
    cfg.value = await devicePersistence.getDrivers();
  }

  async function save(): Promise<void> {
    saving.value = true;
    message.value = null;
    errorMsg.value = null;
    try {
      await devicePersistence.setDrivers(cfg.value);
      await driverRegistry.reload();
      message.value = 'Configurazione salvata. Il polling userà i nuovi driver al prossimo tick.';
    } catch (err: any) {
      errorMsg.value = err?.message || 'Salvataggio fallito';
    } finally {
      saving.value = false;
    }
  }

  async function applyDiscovered(
    host: string,
    port: number,
    candidate: DriverCandidate,
  ): Promise<void> {
    if (candidate.kind === 'printer') {
      cfg.value = {
        ...cfg.value,
        printer: { name: candidate.driver, options: { ...cfg.value.printer.options, host, port } },
      };
    } else {
      cfg.value = {
        ...cfg.value,
        payment: { name: candidate.driver, options: { ...cfg.value.payment.options, host, port } },
      };
    }
    await save();
  }

  async function testConnection(kind: 'printer' | 'payment'): Promise<{ online: boolean; latencyMs?: number; error?: string; raw?: any }> {
    const start = Date.now();
    try {
      const drv = kind === 'printer' ? await driverRegistry.getPrinter() : await driverRegistry.getPayment();
      const status = await drv.getStatus();
      return {
        online: !!status.online,
        latencyMs: Date.now() - start,
        error: status.error as string | undefined,
        raw: status,
      };
    } catch (err: any) {
      return { online: false, latencyMs: Date.now() - start, error: err?.message };
    }
  }

  return { cfg, saving, message, errorMsg, load, save, applyDiscovered, testConnection };
}

/**
 * Persistence layer per pos-rt-mobile.
 *
 * Storage:
 *  - @capacitor/preferences  → device record + token + config (key/value)
 *  - sqlite (via @capacitor-community/sqlite) → audit chain + job queue
 *
 * Volutamente NON condiviso con il daemon Node: questo modulo è la copia
 * mobile-specific. L'API è in stile repository per restare familiare.
 */

import { Preferences } from '@capacitor/preferences';

const KEYS = {
  device: 'pos.device',
  token: 'pos.token',
  apnsToken: 'pos.apns_token',
  platform: 'pos.platform',
  drivers: 'pos.drivers',
  pollInterval: 'pos.poll_interval_s',
  lastCursor: 'pos.last_cursor',
} as const;

export interface DeviceRecord {
  documentId: string;
  name: string;
  strapiUrl: string;
  wsUrl?: string | null;
  pairedAt: string;
}

export interface DriverConfig {
  printer: {
    name: string;
    options: Record<string, unknown>;
  };
  payment: {
    name: string;
    options: Record<string, unknown>;
  };
}

async function getJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function setJson(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

async function remove(key: string): Promise<void> {
  await Preferences.remove({ key });
}

export const devicePersistence = {
  async isPaired(): Promise<boolean> {
    const d = await getJson<DeviceRecord>(KEYS.device);
    const { value: t } = await Preferences.get({ key: KEYS.token });
    return !!d && !!t;
  },

  async get(): Promise<DeviceRecord | null> {
    return getJson<DeviceRecord>(KEYS.device);
  },

  async save(device: DeviceRecord, token: string): Promise<void> {
    await setJson(KEYS.device, device);
    await Preferences.set({ key: KEYS.token, value: token });
  },

  async getToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: KEYS.token });
    return value || null;
  },

  async clear(): Promise<void> {
    await Promise.all([
      remove(KEYS.device),
      remove(KEYS.token),
      remove(KEYS.apnsToken),
      remove(KEYS.lastCursor),
    ]);
  },

  async getApnsToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: KEYS.apnsToken });
    return value || null;
  },

  async saveApnsToken(token: string | null): Promise<void> {
    if (token == null) {
      await remove(KEYS.apnsToken);
    } else {
      await Preferences.set({ key: KEYS.apnsToken, value: token });
    }
  },

  async getPlatform(): Promise<string> {
    const { value } = await Preferences.get({ key: KEYS.platform });
    return value || detectPlatform();
  },

  async setPlatform(platform: string): Promise<void> {
    await Preferences.set({ key: KEYS.platform, value: platform });
  },

  async getDrivers(): Promise<DriverConfig> {
    const cfg = await getJson<DriverConfig>(KEYS.drivers);
    return (
      cfg ?? {
        printer: { name: 'stub', options: {} },
        payment: { name: 'stub', options: {} },
      }
    );
  },

  async setDrivers(cfg: DriverConfig): Promise<void> {
    await setJson(KEYS.drivers, cfg);
  },

  async getPollInterval(): Promise<number> {
    const { value } = await Preferences.get({ key: KEYS.pollInterval });
    const n = value ? Number(value) : NaN;
    return Number.isFinite(n) && n >= 5 ? n : 10;
  },

  async setPollInterval(seconds: number): Promise<void> {
    if (seconds < 5) throw new Error('poll interval minimo 5s');
    await Preferences.set({ key: KEYS.pollInterval, value: String(seconds) });
  },

  async getLastCursor(): Promise<string | null> {
    const { value } = await Preferences.get({ key: KEYS.lastCursor });
    return value || null;
  },

  async setLastCursor(cursor: string): Promise<void> {
    await Preferences.set({ key: KEYS.lastCursor, value: cursor });
  },
};

function detectPlatform(): string {
  // Quando importato in app web (build SPA), fallback a 'other'.
  // In Capacitor runtime invece la piattaforma reale è esposta da Capacitor.getPlatform().
  // Importiamo lazy per non rompere il bundle web.
  try {
    // @ts-expect-error optional
    const cap = window.Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android' || p === 'web') return p === 'web' ? 'other' : p;
    }
  } catch (_) {
    /* ignore */
  }
  return 'other';
}

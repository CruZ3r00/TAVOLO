/**
 * Audit log mobile — append-only, persistito in @capacitor/preferences come
 * ring buffer di max 500 entry. Niente chain hash (l'integrità qui è di
 * meno importanza fiscale rispetto al daemon desktop, perché lo scontrino
 * fiscale lo emette l'RT direttamente — non noi).
 *
 * Per uso: dashboard mostra le ultime 50, debug/diagnostica.
 */

import { Preferences } from '@capacitor/preferences';

const KEY = 'pos.audit_log';
const MAX_ENTRIES = 500;

export interface AuditEntry {
  ts: string;
  kind: string;
  eventId?: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

async function getAll(): Promise<AuditEntry[]> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export const auditLog = {
  async append(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
    const all = await getAll();
    all.push({ ts: new Date().toISOString(), ...entry });
    if (all.length > MAX_ENTRIES) all.splice(0, all.length - MAX_ENTRIES);
    await Preferences.set({ key: KEY, value: JSON.stringify(all) });
  },
  async tail(limit = 50): Promise<AuditEntry[]> {
    const all = await getAll();
    return all.slice(-limit).reverse();
  },
  async clear(): Promise<void> {
    await Preferences.remove({ key: KEY });
  },
  async count(): Promise<number> {
    const all = await getAll();
    return all.length;
  },
};

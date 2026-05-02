/**
 * Idempotency store persistito (Capacitor Preferences).
 *
 * **Scopo critico:** prevenire **doppio addebito** sui POS reali (Nexi P17,
 * generic-ecr, jpos) se l'app è killata fra la riuscita del charge e l'ack a
 * Strapi. Senza persistenza, al riavvio Strapi rifaccia il job e l'in-memory
 * cache dei driver non c'è più → seconda charge sul cliente.
 *
 * **Pattern WAL-like** (consumato da `jobHandlers.ts::handleOrderClose`):
 *   1. setPending(key, ...) PRIMA di chiamare `payment.charge`
 *   2. operazione POS
 *   3. markCompleted(key, outcome) DOPO il successo
 *   3bis. markFailed(key, err) DOPO un fallimento esplicito (RC declined ecc.)
 *
 * **Su retry stesso event_id:**
 *   - completed → ritorna outcome cached, NIENTE re-charge
 *   - pending → invoca `driver.inquiry?` (se disponibile) per scoprire lo stato.
 *               Approved → markCompleted, prosegui. Not-found → safe re-issue.
 *               Errore Inquiry → markFailed con messaggio "verifica manuale" e
 *               propaga eccezione: il job resta failed lato Strapi, l'oste
 *               vede l'ordine non chiuso e controlla il rotolo del POS.
 *   - failed → libero di riprovare (un fallimento esplicito non è un addebito)
 *
 * Storage: `@capacitor/preferences` con chiave `pos.payment_pending` →
 * mappa { [key]: PendingRecord }. Atomicità best-effort (Preferences non ha
 * transazioni, ma le mutazioni sono single-flight per key dato il tick polling).
 */

import { Preferences } from '@capacitor/preferences';
import {
  type IdempotencyStore,
  type PendingRecord,
} from '../drivers/helpers/idempotency';
import type { ChargeOutcome } from '../drivers/types';

const KEY = 'pos.payment_pending';
const DEFAULT_GC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Snapshot = Record<string, PendingRecord>;

async function loadAll(): Promise<Snapshot> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Snapshot) : {};
  } catch {
    return {};
  }
}

async function saveAll(snap: Snapshot): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(snap) });
}

class PreferencesIdempotencyStore implements IdempotencyStore {
  async get(key: string): Promise<PendingRecord | null> {
    const all = await loadAll();
    return all[key] ?? null;
  }

  async setPending(
    key: string,
    init: Omit<PendingRecord, 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<PendingRecord> {
    const all = await loadAll();
    const existing = all[key];
    if (existing) return existing; // SET-IF-ABSENT: never overwrite
    const now = new Date().toISOString();
    const rec: PendingRecord = { ...init, status: 'pending', createdAt: now, updatedAt: now };
    all[key] = rec;
    await saveAll(all);
    return rec;
  }

  async markCompleted(key: string, outcome: ChargeOutcome): Promise<void> {
    const all = await loadAll();
    const rec = all[key];
    if (!rec) return;
    rec.status = 'completed';
    rec.outcome = outcome;
    rec.transactionId = outcome.transactionId;
    rec.updatedAt = new Date().toISOString();
    await saveAll(all);
  }

  async markFailed(key: string, error: { code: string; message: string }): Promise<void> {
    const all = await loadAll();
    const rec = all[key];
    if (!rec) return;
    rec.status = 'failed';
    rec.error = error;
    rec.updatedAt = new Date().toISOString();
    await saveAll(all);
  }

  async gc(maxAgeMs: number = DEFAULT_GC_MAX_AGE_MS): Promise<number> {
    const all = await loadAll();
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const k of Object.keys(all)) {
      if (Date.parse(all[k].updatedAt) < cutoff) {
        delete all[k];
        removed++;
      }
    }
    if (removed > 0) await saveAll(all);
    return removed;
  }
}

/** Singleton: usato da jobHandlers + scheduler. */
export const persistedIdempotencyStore: IdempotencyStore = new PreferencesIdempotencyStore();

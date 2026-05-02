/**
 * Idempotency store — interfaccia astratta per ricordare le charge in volo
 * e prevenire doppi addebiti dopo crash/kill dell'app.
 *
 * In PR4 una implementazione concreta backed da `@capacitor/preferences` viene
 * iniettata in `jobHandlers.ts`. Qui esponiamo solo l'interfaccia + un'impl
 * in-memory (utile per test e per fallback se la persistence fallisce).
 *
 * Pattern WAL-like:
 *   1. setPending(key, partial) PRIMA di toccare il POS reale
 *   2. operazione POS
 *   3. markCompleted/Failed dopo
 *
 * Su retry con stesso `key`: il driver legge il record. Se trovato:
 *   - completed → ritorna outcome cached (no double charge)
 *   - pending → fa Inquiry sul POS prima di re-issue
 *   - failed  → libero di riprovare (idempotenza non garantisce no-op se l'esito
 *               precedente è stato un fallimento esplicito del POS)
 */

import type { ChargeOutcome } from '../types';

export type PendingStatus = 'pending' | 'completed' | 'failed';

export interface PendingRecord {
  key: string;
  status: PendingStatus;
  driver: string;
  /** orderRef o null. Snapshot al momento della creazione. */
  orderRef: string | null;
  /** ID transazione assegnato dal driver al primo tentativo. Necessario per Inquiry. */
  transactionId?: string;
  /** Importo registrato (centesimi). */
  amountCents?: number;
  /** ISO timestamp di creazione. */
  createdAt: string;
  /** ISO timestamp ultimo update. */
  updatedAt: string;
  /** Outcome finale se status=completed. */
  outcome?: ChargeOutcome;
  /** Error info se status=failed. */
  error?: { code: string; message: string };
}

export interface IdempotencyStore {
  get(key: string): Promise<PendingRecord | null>;
  setPending(key: string, init: Omit<PendingRecord, 'status' | 'createdAt' | 'updatedAt'>): Promise<PendingRecord>;
  markCompleted(key: string, outcome: ChargeOutcome): Promise<void>;
  markFailed(key: string, error: { code: string; message: string }): Promise<void>;
  /** Cancella record più vecchi di `maxAgeMs` (default 24h). */
  gc(maxAgeMs?: number): Promise<number>;
}

/** In-memory fallback. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, PendingRecord>();

  async get(key: string): Promise<PendingRecord | null> {
    return this.map.get(key) ?? null;
  }

  async setPending(
    key: string,
    init: Omit<PendingRecord, 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<PendingRecord> {
    const now = new Date().toISOString();
    const existing = this.map.get(key);
    if (existing) return existing; // SET-IF-ABSENT: non sovrascriviamo lo stato precedente
    const rec: PendingRecord = { ...init, status: 'pending', createdAt: now, updatedAt: now };
    this.map.set(key, rec);
    return rec;
  }

  async markCompleted(key: string, outcome: ChargeOutcome): Promise<void> {
    const rec = this.map.get(key);
    if (!rec) return;
    rec.status = 'completed';
    rec.outcome = outcome;
    rec.transactionId = outcome.transactionId;
    rec.updatedAt = new Date().toISOString();
  }

  async markFailed(key: string, error: { code: string; message: string }): Promise<void> {
    const rec = this.map.get(key);
    if (!rec) return;
    rec.status = 'failed';
    rec.error = error;
    rec.updatedAt = new Date().toISOString();
  }

  async gc(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [k, r] of this.map) {
      if (Date.parse(r.updatedAt) < cutoff) {
        this.map.delete(k);
        removed++;
      }
    }
    return removed;
  }
}

/** Singleton globale (in-memory) usato come default. PR4 lo sostituisce con persisted. */
export const defaultIdempotencyStore: IdempotencyStore = new InMemoryIdempotencyStore();

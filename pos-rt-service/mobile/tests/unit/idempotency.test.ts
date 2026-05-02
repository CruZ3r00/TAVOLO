import { describe, it, expect } from 'vitest';
import {
  InMemoryIdempotencyStore,
  type PendingRecord,
} from '../../src/drivers/helpers/idempotency';
import type { ChargeOutcome } from '../../src/drivers/types';

function fakeOutcome(txId: string, amount = 10): ChargeOutcome {
  return {
    success: true,
    transactionId: txId,
    amount,
    currency: 'EUR',
    orderRef: 'ORD-1',
    timestamp: new Date().toISOString(),
    driver: 'nexi-p17',
    code: '00',
    message: 'OK',
  };
}

describe('InMemoryIdempotencyStore', () => {
  it('get di una chiave nuova ritorna null', async () => {
    const s = new InMemoryIdempotencyStore();
    expect(await s.get('k1')).toBeNull();
  });

  it('setPending crea record con status=pending', async () => {
    const s = new InMemoryIdempotencyStore();
    const rec = await s.setPending('k1', {
      key: 'k1',
      driver: 'nexi-p17',
      orderRef: 'ORD-1',
      transactionId: 'T1',
      amountCents: 1000,
    });
    expect(rec.status).toBe('pending');
    expect(rec.amountCents).toBe(1000);
    expect((await s.get('k1'))?.status).toBe('pending');
  });

  it('setPending con stessa key NON sovrascrive (set-if-absent)', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.setPending('k1', {
      key: 'k1',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T1',
      amountCents: 100,
    });
    const second = await s.setPending('k1', {
      key: 'k1',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T2', // diverso!
      amountCents: 999,
    });
    // Deve restituire il record originale (nessun overwrite)
    expect(second.transactionId).toBe('T1');
    expect(second.amountCents).toBe(100);
  });

  it('markCompleted aggiorna status e cache outcome', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.setPending('k1', {
      key: 'k1',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T1',
      amountCents: 500,
    });
    const out = fakeOutcome('TX-FROM-POS', 5);
    await s.markCompleted('k1', out);
    const rec = await s.get('k1');
    expect(rec?.status).toBe('completed');
    expect(rec?.outcome?.transactionId).toBe('TX-FROM-POS');
    expect(rec?.transactionId).toBe('TX-FROM-POS');
  });

  it('markFailed aggiorna status', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.setPending('k1', {
      key: 'k1',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T1',
      amountCents: 100,
    });
    await s.markFailed('k1', { code: 'PAYMENT_DECLINED', message: 'rifiutato' });
    const rec = await s.get('k1');
    expect(rec?.status).toBe('failed');
    expect(rec?.error?.code).toBe('PAYMENT_DECLINED');
  });

  it('markCompleted/Failed su key non esistente è no-op (no throw)', async () => {
    const s = new InMemoryIdempotencyStore();
    await expect(s.markCompleted('nope', fakeOutcome('X'))).resolves.toBeUndefined();
    await expect(
      s.markFailed('nope', { code: 'X', message: 'y' }),
    ).resolves.toBeUndefined();
  });

  it('gc rimuove record più vecchi di maxAge', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.setPending('old', {
      key: 'old',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T-old',
      amountCents: 100,
    });
    // Forzo il timestamp per il test
    const rec = (await s.get('old'))!;
    (rec as PendingRecord).updatedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await s.setPending('fresh', {
      key: 'fresh',
      driver: 'nexi-p17',
      orderRef: null,
      transactionId: 'T-fresh',
      amountCents: 200,
    });
    const removed = await s.gc(24 * 3600 * 1000);
    expect(removed).toBe(1);
    expect(await s.get('old')).toBeNull();
    expect(await s.get('fresh')).not.toBeNull();
  });
});

import { DriverError } from './types';
import type {
  ChargeInput,
  ChargeOutcome,
  DriverStatus,
  PaymentDriver,
  RefundInput,
  RefundOutcome,
} from './types';

/**
 * StubPaymentDriver — utile in dev per testare il flow senza un POS reale.
 * Latenza simulata, idempotency cache in-memory.
 */
export class StubPaymentDriver implements PaymentDriver {
  readonly name = 'stub';
  private latencyMs: number;
  private failureRate: number;
  private cache = new Map<string, ChargeOutcome>();
  private initialized = false;

  constructor(opts: { latencyMs?: number; failureRate?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 200;
    this.failureRate = opts.failureRate ?? 0;
  }

  async init(): Promise<void> {
    this.initialized = true;
  }

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!this.initialized) await this.init();
    if (input.idempotencyKey && this.cache.has(input.idempotencyKey)) {
      return this.cache.get(input.idempotencyKey)!;
    }
    await sleep(this.latencyMs);
    if (Math.random() < this.failureRate) {
      throw new DriverError('PAYMENT_DECLINED', 'stub: failure simulato');
    }
    const outcome: ChargeOutcome = {
      success: true,
      transactionId: 'STUB-' + randomHex(6).toUpperCase(),
      amount: input.amount,
      currency: input.currency || 'EUR',
      orderRef: input.orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code: '00',
      message: 'OK',
    };
    if (input.idempotencyKey) this.cache.set(input.idempotencyKey, outcome);
    return outcome;
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    await sleep(this.latencyMs);
    return {
      success: true,
      refundId: 'STUB-R-' + randomHex(6).toUpperCase(),
      transactionId: input.transactionId,
      amount: input.amount,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus(): Promise<DriverStatus> {
    return { online: true, name: this.name };
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generic ECR driver mobile — OPI XML su TCP, port da pos-rt-service Node.
 * Richiede il plugin Capacitor nativo `PosTcpSocket` (build Android/iOS).
 */

import { sendTcpOnce } from '../plugins/tcpSocket';
import { DriverError } from './types';
import type {
  ChargeInput,
  ChargeOutcome,
  DriverStatus,
  PaymentDriver,
  RefundInput,
  RefundOutcome,
} from './types';

export interface GenericEcrOptions {
  host: string;
  port?: number;
  workstationId?: string;
  popId?: string;
  applicationSender?: string;
  currency?: number;
  timeoutMs?: number;
}

export class GenericEcrDriverMobile implements PaymentDriver {
  readonly name = 'generic-ecr';
  private opts: Required<GenericEcrOptions>;
  private cache = new Map<string, ChargeOutcome>();
  private initialized = false;
  private reqCounter = 0;

  constructor(opts: GenericEcrOptions) {
    this.opts = {
      port: 6000,
      workstationId: 'POS01',
      popId: '1',
      applicationSender: 'pos-rt-mobile',
      currency: 978,
      timeoutMs: 30_000,
      ...opts,
    } as Required<GenericEcrOptions>;
  }

  async init(): Promise<void> {
    if (!this.opts.host) throw new DriverError('DRIVER_UNAVAILABLE', 'generic-ecr: host mancante');
    this.initialized = true;
  }

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!this.initialized) await this.init();
    if (input.idempotencyKey && this.cache.has(input.idempotencyKey)) {
      return this.cache.get(input.idempotencyKey)!;
    }
    const minor = Math.round(Number(input.amount) * 100);
    const requestId = input.idempotencyKey || this.nextRequestId();
    const xml = this.buildPaymentXml(requestId, minor, input.orderRef);
    const respXml = await this.send(xml);
    const result = this.parseResponse(respXml, requestId, minor, input.currency || 'EUR', input.orderRef);
    if (!result.success) {
      throw new DriverError(
        result.code === '04' ? 'PAYMENT_DECLINED' : 'DRIVER_ERROR',
        `generic-ecr: ${result.message}`,
        result,
      );
    }
    if (input.idempotencyKey) this.cache.set(input.idempotencyKey, result);
    return result;
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    const minor = Math.round(input.amount * 100);
    const requestId = this.nextRequestId();
    const xml = this.buildRefundXml(requestId, minor, input.transactionId);
    const respXml = await this.send(xml);
    const result = this.parseResponse(respXml, requestId, minor, 'EUR', null);
    if (!result.success) {
      throw new DriverError('DRIVER_ERROR', `generic-ecr refund: ${result.message}`);
    }
    return {
      success: true,
      refundId: result.transactionId,
      transactionId: input.transactionId,
      amount: input.amount,
      timestamp: result.timestamp,
      driver: this.name,
    };
  }

  async getStatus(): Promise<DriverStatus> {
    try {
      await this.diagnosis();
      return { online: true, name: this.name, host: this.opts.host };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  private async diagnosis(): Promise<void> {
    const xml = this.buildDiagnosisXml(this.nextRequestId());
    const resp = await this.send(xml, 5_000);
    if (!/OverallResult="Success"/.test(resp)) {
      throw new DriverError('DRIVER_ERROR', 'generic-ecr Diagnosis fallita');
    }
  }

  private nextRequestId(): string {
    this.reqCounter = (this.reqCounter + 1) % 1_000_000_000;
    return String(Date.now()).slice(-6) + String(this.reqCounter).padStart(4, '0');
  }

  private buildPaymentXml(requestId: string, minor: number, orderRef?: string): string {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="Payment" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.opts.workstationId)}" ApplicationSender="${esc(this.opts.applicationSender)}" ` +
      `POPID="${esc(this.opts.popId)}">` +
      `<POSdata><POSTimeStamp>${ts}</POSTimeStamp>` +
      (orderRef ? `<TransNum>${esc(orderRef)}</TransNum>` : '') +
      `</POSdata>` +
      `<TotalAmount Currency="${this.opts.currency}">${minor}</TotalAmount>` +
      `</ServiceRequest>`
    );
  }

  private buildRefundXml(requestId: string, minor: number, originalTx?: string): string {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="ReversePayment" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.opts.workstationId)}" ApplicationSender="${esc(this.opts.applicationSender)}" ` +
      `POPID="${esc(this.opts.popId)}">` +
      `<POSdata><POSTimeStamp>${ts}</POSTimeStamp>` +
      (originalTx ? `<OriginalTransactionID>${esc(originalTx)}</OriginalTransactionID>` : '') +
      `</POSdata>` +
      `<TotalAmount Currency="${this.opts.currency}">${minor}</TotalAmount>` +
      `</ServiceRequest>`
    );
  }

  private buildDiagnosisXml(requestId: string): string {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="Diagnosis" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.opts.workstationId)}" ApplicationSender="${esc(this.opts.applicationSender)}" ` +
      `POPID="${esc(this.opts.popId)}"/>`
    );
  }

  private parseResponse(xml: string, requestId: string, minor: number, currency: string, orderRef?: string | null): ChargeOutcome {
    const overall = (xml.match(/OverallResult="([^"]*)"/) || [])[1];
    const success = overall === 'Success';
    const txId =
      (xml.match(/TransactionID="([^"]*)"/) || [])[1] ||
      (xml.match(/<TransactionID>([^<]*)<\/TransactionID>/) || [])[1] ||
      (xml.match(/ApprovalCode="([^"]*)"/) || [])[1] ||
      `ECR-${requestId}`;
    const errorMsg =
      (xml.match(/<ErrorMessage>([^<]*)<\/ErrorMessage>/) || [])[1] ||
      overall ||
      'errore';
    const code = (xml.match(/AuthorisationResult="([^"]*)"/) || [])[1] || (success ? '00' : '99');
    return {
      success,
      transactionId: txId,
      amount: minor / 100,
      currency,
      orderRef: orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code,
      message: success ? 'OK' : errorMsg,
    };
  }

  private async send(xmlBody: string, timeoutMs?: number): Promise<string> {
    const body = new TextEncoder().encode(xmlBody);
    if (body.length > 9999) throw new DriverError('INVALID_PAYLOAD', 'generic-ecr: body troppo grande');
    const lenStr = String(body.length).padStart(4, '0');
    const lenBuf = new TextEncoder().encode(lenStr);
    const frame = new Uint8Array(lenBuf.length + body.length);
    frame.set(lenBuf, 0);
    frame.set(body, lenBuf.length);
    const resp = await sendTcpOnce(this.opts.host, this.opts.port, frame, {
      timeoutMs: timeoutMs || this.opts.timeoutMs,
    });
    if (resp.length < 4) throw new DriverError('DRIVER_ERROR', 'generic-ecr: risposta troppo corta');
    const expected = parseInt(new TextDecoder().decode(resp.subarray(0, 4)), 10);
    return new TextDecoder().decode(resp.subarray(4, 4 + (Number.isFinite(expected) ? expected : resp.length - 4)));
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

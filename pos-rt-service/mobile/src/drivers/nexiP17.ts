/**
 * Nexi P17 driver mobile — Protocollo 17 / ECR17 (Italia) per terminali POS Nexi.
 *
 * **Wire format (rock-solid, da spec ufficiale Nexi developer portal):**
 *   - Pacchetti applicazione: `STX(0x02) | message | ETX(0x03) | LRC`
 *   - LRC = XOR base 0x7F con tutti i byte tra STX (escluso) e ETX (incluso)
 *   - ACK = `0x06 0x03 0x7A`, NAK = `0x15 0x03 0x69`
 *   - L'ECR (questa app) è il client TCP; il terminale è il server
 *   - Comunicazione iniziata dall'ECR; il terminale risponde con ACK immediato
 *     poi con un secondo pacchetto (response) dopo l'inserimento PIN
 *   - Retry max 3 su NAK / timeout di lettura ACK
 *
 * **Contenuto messaggio (CONFIGURABILE):** la spec wire pubblica non documenta
 * il payload applicativo: ogni cliente Nexi riceve dal merchant team una
 * "matrice di campi" specifica del contratto. Qui usiamo un encoder pluggable
 * (`messageEncoder` opzione): default = pipe-delimited semplice (sufficiente
 * per l'emulatore di test e per terminali demo). Il cliente reale può
 * sostituire `defaultMessageEncoder` con la propria implementazione.
 *
 * **Idempotency / recovery:** la gestione del replay cross-restart NON è dentro
 * il driver. È in `core/jobHandlers.ts`. Qui esponiamo `inquiry()` come metodo
 * opzionale (interfaccia `PaymentDriver.inquiry`) così che il jobHandler possa
 * chiedere al terminale lo stato di una transazione precedente prima di ri-charge.
 */

import { withSession } from '../plugins/tcpStream';
import type { TcpSession } from '../plugins/tcpStream';
import { DriverError } from './types';
import type {
  ChargeInput,
  ChargeOutcome,
  DriverStatus,
  InquiryHint,
  PaymentDriver,
  RefundInput,
  RefundOutcome,
} from './types';
import {
  ACK,
  ETX,
  NAK,
  ackPacket,
  nakPacket,
  unwrapStxEtxLrc,
  wrapStxEtxLrc,
} from './helpers/frame';

export interface NexiP17MessageContext {
  amountCents: number;
  currency: string;
  txnRef: string;
  terminalId: string;
  workstationId: string;
}

export interface NexiP17Response {
  rc: string;
  approved: boolean;
  declined: boolean;
  notFound: boolean;
  transactionId?: string;
  authCode?: string;
  message?: string;
  raw: string;
  fields: Record<string, string>;
}

export interface NexiP17MessageEncoder {
  payment(ctx: NexiP17MessageContext): Uint8Array;
  refund(ctx: NexiP17MessageContext & { originalTxId: string }): Uint8Array;
  inquiry(ctx: { txnRef: string; terminalId: string; workstationId: string }): Uint8Array;
  status(ctx: { terminalId: string; workstationId: string }): Uint8Array;
  parseResponse(raw: Uint8Array): NexiP17Response;
}

/**
 * Encoder default (pipe-delimited). Funziona con l'emulatore `mock-nexi-p17-server.js`
 * e con un sottoinsieme dei terminali ECR17 demo. **SOSTITUIRE** per terminali reali
 * Nexi forniti dal merchant team — la matrice campi è confidenziale per contratto.
 */
export const defaultMessageEncoder: NexiP17MessageEncoder = {
  payment(ctx) {
    const body =
      `OP=PAY|TID=${esc(ctx.terminalId)}|WID=${esc(ctx.workstationId)}|` +
      `AMT=${ctx.amountCents}|CUR=${esc(ctx.currency)}|REF=${esc(ctx.txnRef)}`;
    return new TextEncoder().encode(body);
  },
  refund(ctx) {
    const body =
      `OP=REF|TID=${esc(ctx.terminalId)}|WID=${esc(ctx.workstationId)}|` +
      `AMT=${ctx.amountCents}|CUR=${esc(ctx.currency)}|REF=${esc(ctx.txnRef)}|ORIG=${esc(ctx.originalTxId)}`;
    return new TextEncoder().encode(body);
  },
  inquiry(ctx) {
    const body = `OP=INQ|TID=${esc(ctx.terminalId)}|WID=${esc(ctx.workstationId)}|REF=${esc(ctx.txnRef)}`;
    return new TextEncoder().encode(body);
  },
  status(ctx) {
    const body = `OP=STAT|TID=${esc(ctx.terminalId)}|WID=${esc(ctx.workstationId)}`;
    return new TextEncoder().encode(body);
  },
  parseResponse(raw) {
    const text = new TextDecoder('latin1').decode(raw);
    const fields: Record<string, string> = {};
    for (const part of text.split('|')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      fields[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
    }
    const rc = fields.RC ?? '99';
    return {
      rc,
      approved: rc === '00' || rc === '0',
      declined: rc === '04' || rc === '05' || rc === '51',
      notFound: rc === '13' || (fields.STATUS || '').toUpperCase() === 'NOT_FOUND',
      transactionId: fields.TXN || fields.TRX || fields.AUTH,
      authCode: fields.AUTH,
      message: fields.MSG,
      raw: text,
      fields,
    };
  },
};

export interface NexiP17Options {
  host: string;
  port?: number;
  terminalId?: string;
  workstationId?: string;
  /** ISO 4217 numerico. EUR = '978'. */
  currency?: string;
  connectTimeoutMs?: number;
  ackTimeoutMs?: number;
  responseTimeoutMs?: number;
  maxRetries?: number;
  lrcBase?: number;
  messageEncoder?: NexiP17MessageEncoder;
}

export class NexiP17DriverMobile implements PaymentDriver {
  readonly name = 'nexi-p17';
  private opts: Required<Omit<NexiP17Options, 'messageEncoder'>> & {
    messageEncoder: NexiP17MessageEncoder;
  };
  private initialized = false;

  constructor(opts: NexiP17Options) {
    this.opts = {
      port: 9999,
      terminalId: 'TID00001',
      workstationId: 'POS01',
      currency: '978',
      connectTimeoutMs: 8_000,
      ackTimeoutMs: 5_000,
      responseTimeoutMs: 120_000,
      maxRetries: 3,
      lrcBase: 0x7f,
      messageEncoder: defaultMessageEncoder,
      ...opts,
    } as any;
  }

  async init(): Promise<void> {
    if (!this.opts.host) throw new DriverError('DRIVER_UNAVAILABLE', 'nexi-p17: host mancante');
    this.initialized = true;
  }

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!this.initialized) await this.init();
    const amountCents = Math.round(Number(input.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new DriverError('INVALID_PAYLOAD', `nexi-p17: importo invalido ${input.amount}`);
    }
    const txnRef = (input.idempotencyKey || input.orderRef || `T${Date.now()}`).slice(0, 24);

    return withSession(
      this.opts.host,
      this.opts.port,
      async (s) => {
        const msg = this.opts.messageEncoder.payment({
          amountCents,
          currency: this.opts.currency,
          txnRef,
          terminalId: this.opts.terminalId,
          workstationId: this.opts.workstationId,
        });
        const respPayload = await this.exchange(s, msg);
        const parsed = this.opts.messageEncoder.parseResponse(respPayload);
        if (parsed.approved) {
          return {
            success: true,
            transactionId: parsed.transactionId || txnRef,
            amount: amountCents / 100,
            currency: input.currency || 'EUR',
            orderRef: input.orderRef ?? null,
            timestamp: new Date().toISOString(),
            driver: this.name,
            code: parsed.rc,
            message: parsed.message || 'OK',
          };
        }
        throw new DriverError(
          parsed.declined ? 'PAYMENT_DECLINED' : 'DRIVER_ERROR',
          `nexi-p17: ${parsed.message || 'rifiutato'} (rc=${parsed.rc})`,
          parsed,
        );
      },
      { connectTimeoutMs: this.opts.connectTimeoutMs },
    );
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!this.initialized) await this.init();
    const amountCents = Math.round(input.amount * 100);
    const txnRef = `R${Date.now()}`.slice(0, 24);
    return withSession(
      this.opts.host,
      this.opts.port,
      async (s) => {
        const msg = this.opts.messageEncoder.refund({
          amountCents,
          currency: this.opts.currency,
          txnRef,
          terminalId: this.opts.terminalId,
          workstationId: this.opts.workstationId,
          originalTxId: input.transactionId,
        });
        const respPayload = await this.exchange(s, msg);
        const parsed = this.opts.messageEncoder.parseResponse(respPayload);
        if (!parsed.approved) {
          throw new DriverError(
            'DRIVER_ERROR',
            `nexi-p17 refund: ${parsed.message || 'rifiutato'} (rc=${parsed.rc})`,
            parsed,
          );
        }
        return {
          success: true,
          refundId: parsed.transactionId || txnRef,
          transactionId: input.transactionId,
          amount: input.amount,
          timestamp: new Date().toISOString(),
          driver: this.name,
        };
      },
      { connectTimeoutMs: this.opts.connectTimeoutMs },
    );
  }

  /**
   * Inquiry op (P17 17.6): chiede al terminale lo stato di una transazione precedente.
   *  - Approved sul terminale → ritorna ChargeOutcome (recovery: NIENTE re-charge).
   *  - Confermato non-trovata → ritorna null (safe re-issue).
   *  - Esito incerto / errore comunicazione → throw DriverError. Il jobHandler
   *    deve marcare failed per evitare doppio addebito (verifica manuale).
   */
  async inquiry(txnRef: string, hint: InquiryHint = {}): Promise<ChargeOutcome | null> {
    if (!this.initialized) await this.init();
    return withSession(
      this.opts.host,
      this.opts.port,
      async (s) => {
        const msg = this.opts.messageEncoder.inquiry({
          txnRef,
          terminalId: this.opts.terminalId,
          workstationId: this.opts.workstationId,
        });
        const respPayload = await this.exchange(s, msg, { responseTimeoutMs: 10_000 });
        const parsed = this.opts.messageEncoder.parseResponse(respPayload);
        if (parsed.approved) {
          const amount = (hint.amountCents ?? 0) / 100;
          return {
            success: true,
            transactionId: parsed.transactionId || txnRef,
            amount,
            currency: 'EUR',
            orderRef: hint.orderRef ?? null,
            timestamp: new Date().toISOString(),
            driver: this.name,
            code: parsed.rc,
            message: parsed.message || 'OK (recovered via Inquiry)',
          };
        }
        if (parsed.notFound) return null;
        throw new DriverError(
          'DRIVER_ERROR',
          `nexi-p17 inquiry: stato incerto (rc=${parsed.rc}, msg=${parsed.message ?? '-'})`,
          parsed,
        );
      },
      { connectTimeoutMs: this.opts.connectTimeoutMs },
    );
  }

  async getStatus(): Promise<DriverStatus> {
    if (!this.opts.host) {
      return { online: false, name: this.name, error: 'host non configurato' };
    }
    try {
      await withSession(
        this.opts.host,
        this.opts.port,
        async (s) => {
          const msg = this.opts.messageEncoder.status({
            terminalId: this.opts.terminalId,
            workstationId: this.opts.workstationId,
          });
          await this.exchange(s, msg, { responseTimeoutMs: 5_000 });
        },
        { connectTimeoutMs: 3_000 },
      );
      return { online: true, name: this.name, host: this.opts.host, port: this.opts.port };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err?.message };
    }
  }

  async dispose(): Promise<void> {
    /* no persistent resource: ogni charge apre/chiude la session */
  }

  /**
   * Send + recv ACK + recv response + send ACK. Retry max sui NAK.
   * Ritorna il payload (senza STX/ETX/LRC) della response.
   */
  private async exchange(
    session: TcpSession,
    payload: Uint8Array,
    overrides: { responseTimeoutMs?: number } = {},
  ): Promise<Uint8Array> {
    const wrapped = wrapStxEtxLrc(payload, this.opts.lrcBase);
    let lastError: any = null;
    for (let attempt = 1; attempt <= this.opts.maxRetries; attempt++) {
      await session.send(wrapped);
      const ackByte = await this.readAckOrNak(session);
      if (ackByte === ACK) { lastError = null; break; }
      if (ackByte === NAK) {
        lastError = new DriverError('DRIVER_ERROR', `nexi-p17: NAK ricevuto (tentativo ${attempt})`);
        continue;
      }
      lastError = new DriverError(
        'DRIVER_ERROR',
        `nexi-p17: byte di controllo inatteso 0x${ackByte.toString(16)} (tentativo ${attempt})`,
      );
    }
    if (lastError) throw lastError;

    const respFrame = await session.recvUntil(
      ETX,
      1, // 1 byte tail per leggere il LRC
      overrides.responseTimeoutMs ?? this.opts.responseTimeoutMs,
    );
    let unwrapped: { payload: Uint8Array; lrc: number };
    try {
      unwrapped = unwrapStxEtxLrc(respFrame, this.opts.lrcBase);
    } catch (err: any) {
      try { await session.send(nakPacket(this.opts.lrcBase)); } catch (_) { /* swallow */ }
      throw new DriverError('DRIVER_ERROR', `nexi-p17: response framing invalida — ${err.message}`);
    }
    try {
      await session.send(ackPacket(this.opts.lrcBase));
    } catch (_) {
      /* il terminale a volte chiude subito dopo aver inviato la response: non fatale */
    }
    return unwrapped.payload;
  }

  private async readAckOrNak(session: TcpSession): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < this.opts.ackTimeoutMs) {
      const chunk = await session.recv(Math.min(1_000, this.opts.ackTimeoutMs), 1);
      if (chunk.length === 1) return chunk[0];
    }
    throw new DriverError('DRIVER_TIMEOUT', `nexi-p17: timeout attesa ACK (${this.opts.ackTimeoutMs}ms)`);
  }
}

function esc(s: string): string {
  return String(s).replace(/[|\r\n\x00-\x1f]/g, '_');
}

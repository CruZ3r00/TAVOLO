/**
 * Tipi/interfacce dei driver mobile. Replicano il contratto del daemon Node
 * (pos-rt-service/src/drivers/{payment,printer}/base.js) ma indipendenti
 * (no import dal Node, no codice condiviso).
 */

export interface ChargeInput {
  amount: number;
  currency?: string;
  idempotencyKey?: string;
  orderRef?: string;
}

export interface ChargeOutcome {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
  orderRef: string | null;
  timestamp: string;
  driver: string;
  code?: string;
  message?: string;
}

export interface RefundInput {
  transactionId: string;
  amount: number;
}

export interface RefundOutcome {
  success: boolean;
  refundId: string;
  transactionId: string;
  amount: number;
  timestamp: string;
  driver: string;
}

export interface ReceiptItem {
  name?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  price?: number;
  vatGroup?: string | number;
  department?: string | number;
}

export interface ReceiptInput {
  items: ReceiptItem[];
  total?: number;
  header?: string;
  footer?: string;
  payment_method?: string;
  payment_type?: number;
  payment_description?: string;
}

export interface KitchenTicketItem {
  name?: string;
  quantity?: number;
  category?: string | null;
  course?: number;
  notes?: string | null;
}

export interface KitchenTicketInput {
  action?: 'add' | 'update' | 'cancel' | 'reprint' | string;
  station?: string | null;
  title?: string;
  table?: {
    number?: string | number | null;
    area?: string | null;
  } | null;
  takeaway?: {
    customer_name?: string | null;
    pickup_at?: string | null;
  } | null;
  order?: {
    documentId?: string;
    service_type?: string;
    opened_at?: string;
  } | null;
  items: KitchenTicketItem[];
  printed_at?: string;
}

export interface PrintOutcome {
  success: boolean;
  receipt_no: string;
  fiscal?: boolean;
  timestamp: string;
  driver: string;
}

export interface DriverStatus {
  online: boolean;
  name: string;
  degraded?: boolean;
  error?: string;
  [k: string]: unknown;
}

export interface InquiryHint {
  amountCents?: number;
  orderRef?: string | null;
}

export interface PaymentDriver {
  readonly name: string;
  init(): Promise<void>;
  charge(input: ChargeInput): Promise<ChargeOutcome>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  getStatus(): Promise<DriverStatus>;
  dispose(): Promise<void>;
  /**
   * Opzionale: dato un txnRef, chiede al terminale lo stato della transazione.
   * Usato dal jobHandler per recovery dopo crash dell'app prima dell'ack.
   * - Ritorna ChargeOutcome se la transazione è approvata sul terminale.
   * - Ritorna null se confermato "non trovata" (safe re-issue).
   * - Throw se incerto: il jobHandler deve marcare failed e bloccare retry per evitare doppio addebito.
   */
  inquiry?(txnRef: string, hint: InquiryHint): Promise<ChargeOutcome | null>;
}

export interface PrinterDriver {
  readonly name: string;
  init(): Promise<void>;
  printReceipt(data: ReceiptInput): Promise<PrintOutcome>;
  printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome>;
  printKitchenTicket?(data: KitchenTicketInput): Promise<PrintOutcome>;
  getStatus(): Promise<DriverStatus>;
  dispose(): Promise<void>;
}

export class DriverError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

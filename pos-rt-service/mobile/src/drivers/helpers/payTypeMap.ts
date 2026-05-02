/**
 * Map "logical" payment_method → vendor-specific numeric code per i driver
 * stampante/RT. Centralizza la logica oggi duplicata in customXon, escposFiscal
 * ed epsonFpmate. Senza spec ufficiali per ogni vendor, i numeri replicano
 * esattamente quanto già usato dai driver attuali (zero behavior change).
 *
 * Quando si aggiunge un nuovo vendor (italretail, ecc.) bastano 4 righe qui.
 */

export type PaymentMethod = string | undefined | null;

export type PrinterVendor =
  | 'custom-xon'
  | 'escpos-fiscal'
  | 'italretail'
  | 'epson-fpmate';

export type PosVendor = 'generic-ecr' | 'jpos' | 'nexi-p17';

interface VendorMap {
  cash: number;
  card: number;
  voucher: number;
  fallback: number;
}

const PRINTER_VENDOR_TABLE: Record<PrinterVendor, VendorMap> = {
  // Stesso set della baseline `customXon.ts` / `escposFiscal.ts` (preservato).
  'custom-xon': { cash: 1, card: 2, voucher: 4, fallback: 5 },
  'escpos-fiscal': { cash: 1, card: 2, voucher: 4, fallback: 5 },
  // Italretail rebrandizza Custom: stesso set.
  italretail: { cash: 1, card: 2, voucher: 4, fallback: 5 },
  // Epson FPMate (mantiene baseline `epsonFpmate.ts`).
  'epson-fpmate': { cash: 0, card: 2, voucher: 3, fallback: 4 },
};

/**
 * Restituisce il codice numerico del payment_method per il vendor scelto.
 * Default: cash.
 */
export function mapPrinterPaymentType(method: PaymentMethod, vendor: PrinterVendor): number {
  const table = PRINTER_VENDOR_TABLE[vendor];
  if (!method) return table.cash;
  const m = String(method).toLowerCase().trim();
  if (m === 'cash' || m === 'contanti' || m === 'cassa') return table.cash;
  if (m === 'card' || m === 'pos' || m === 'credit_card' || m === 'debit_card' || m === 'bancomat') return table.card;
  if (m === 'meal_voucher' || m === 'ticket' || m === 'buono_pasto') return table.voucher;
  if (m === 'fiscal_register' || m === 'rt') return table.card; // fiscal-register usato come "carta" lato RT
  return table.fallback;
}

/**
 * Per i driver POS (charge), la logica è diversa: il "tipo" lo decide
 * il terminale stesso (l'utente sceglie sul PIN-pad). Lasciamo questa
 * funzione qui come hook futuro.
 */
export function mapPosPaymentType(_method: PaymentMethod, _vendor: PosVendor): number | undefined {
  return undefined;
}

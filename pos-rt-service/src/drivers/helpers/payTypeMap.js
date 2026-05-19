'use strict';

/**
 * Map "logical" payment_method -> vendor-specific numeric code per i driver
 * stampante/RT. Centralizza la logica oggi duplicata in customXon, escposFiscal
 * ed epsonFpmate.
 *
 * Ported from mobile/src/drivers/helpers/payTypeMap.ts (TypeScript -> CommonJS).
 */

const PRINTER_VENDOR_TABLE = {
  'custom-xon': { cash: 1, card: 2, voucher: 4, fallback: 5 },
  'escpos-fiscal': { cash: 1, card: 2, voucher: 4, fallback: 5 },
  italretail: { cash: 1, card: 2, voucher: 4, fallback: 5 },
  'epson-fpmate': { cash: 0, card: 2, voucher: 3, fallback: 4 },
};

/**
 * Restituisce il codice numerico del payment_method per il vendor scelto.
 * Default: cash.
 * @param {string|null|undefined} method
 * @param {string} vendor
 * @returns {number}
 */
function mapPrinterPaymentType(method, vendor) {
  const table = PRINTER_VENDOR_TABLE[vendor];
  if (!table) return 1; // fallback cash
  if (!method) return table.cash;
  const m = String(method).toLowerCase().trim();
  if (m === 'cash' || m === 'contanti' || m === 'cassa') return table.cash;
  if (m === 'card' || m === 'pos' || m === 'credit_card' || m === 'debit_card' || m === 'bancomat') return table.card;
  if (m === 'meal_voucher' || m === 'ticket' || m === 'buono_pasto') return table.voucher;
  if (m === 'fiscal_register' || m === 'rt') return table.card;
  return table.fallback;
}

/**
 * Per i driver POS (charge), la logica e' diversa: il "tipo" lo decide
 * il terminale stesso (l'utente sceglie sul PIN-pad).
 * @param {string|null|undefined} _method
 * @param {string} _vendor
 * @returns {number|undefined}
 */
function mapPosPaymentType(_method, _vendor) {
  return undefined;
}

module.exports = { mapPrinterPaymentType, mapPosPaymentType };

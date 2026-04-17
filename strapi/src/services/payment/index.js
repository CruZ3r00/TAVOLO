'use strict';

/**
 * Payment service — strategy pattern.
 *
 * Registry/factory che carica la strategy appropriata e invoca `charge()`.
 * Default: 'simulator'. Override per-request via parametro `method` oppure
 * globale via env `PAYMENT_STRATEGY`.
 *
 * Vedi ADR-0002.7 per le motivazioni.
 */

const simulator = require('./strategies/simulator');
const pos = require('./strategies/pos');
const fiscalRegister = require('./strategies/fiscal-register');

const strategies = {
  simulator,
  pos,
  fiscal_register: fiscalRegister,
};

/**
 * Errori standard del payment service.
 */
function paymentError(code, message, details) {
  const err = new Error(message);
  err._resCode = code;
  err.details = details || null;
  return err;
}

/**
 * Esegue un pagamento.
 *
 * @param {object} params
 * @param {number} params.amount importo
 * @param {string} [params.currency='EUR'] valuta
 * @param {string} params.orderId documentId dell'ordine
 * @param {string} [params.method] strategy da usare (override env)
 * @param {object} [params.metadata] dati aggiuntivi per il provider
 * @returns {Promise<{ success: boolean, transactionId: string, timestamp: string, amount: number, currency: string }>}
 */
async function charge({ amount, currency, orderId, method, metadata }) {
  const strategyName = method || process.env.PAYMENT_STRATEGY || 'simulator';
  const strategy = strategies[strategyName];

  if (!strategy) {
    throw paymentError(
      'PAYMENT_UNAVAILABLE',
      `Strategy di pagamento "${strategyName}" non disponibile.`
    );
  }

  try {
    const result = await strategy.charge({
      amount,
      currency: currency || 'EUR',
      orderId,
      metadata: metadata || {},
    });
    return result;
  } catch (err) {
    // Se l'errore ha gia il nostro formato, lo rilanciamo com'e
    if (err._resCode) throw err;
    // Altrimenti lo wrappamo
    throw paymentError(
      'PAYMENT_UNAVAILABLE',
      `Errore dal payment provider (${strategyName}): ${err.message}`
    );
  }
}

module.exports = {
  charge,
  paymentError,
};

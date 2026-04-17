'use strict';

/**
 * Payment strategy: Simulator.
 *
 * Simula un pagamento locale per sviluppo e test.
 * Configurabile via env:
 * - PAYMENT_SIMULATOR_LATENCY_MS: latenza simulata in ms (default 200)
 * - PAYMENT_SIMULATOR_FAILURE_RATE: probabilita di fallimento 0..1 (default 0)
 *
 * Vedi ADR-0002.7.
 */

const crypto = require('crypto');

/**
 * @param {object} params
 * @param {number} params.amount importo
 * @param {string} params.currency valuta (es. 'EUR')
 * @param {string} params.orderId documentId dell'ordine
 * @param {object} [params.metadata] dati aggiuntivi (ignorati dal simulator)
 * @returns {Promise<{ success: boolean, transactionId: string, timestamp: string, amount: number, currency: string }>}
 */
async function charge({ amount, currency, orderId, metadata }) {
  const latency = parseInt(process.env.PAYMENT_SIMULATOR_LATENCY_MS || '200', 10);
  const failureRate = parseFloat(process.env.PAYMENT_SIMULATOR_FAILURE_RATE || '0');

  // Simula latenza di rete
  if (latency > 0) {
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  // Simula fallimento configurabile
  if (failureRate > 0 && Math.random() < failureRate) {
    const err = new Error('Pagamento simulato rifiutato.');
    err._resCode = 'PAYMENT_DECLINED';
    throw err;
  }

  return {
    success: true,
    transactionId: `SIM-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    amount,
    currency: currency || 'EUR',
  };
}

module.exports = { charge };

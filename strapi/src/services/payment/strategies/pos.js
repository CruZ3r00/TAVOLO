'use strict';

/**
 * Payment strategy: POS fisico.
 *
 * Stub — interfaccia pronta per integrazione con terminali POS
 * (es. SumUp, Nexi, Ingenico).
 *
 * TODO: Implementare connessione al terminale POS:
 * - Configurazione endpoint POS via env (POS_HOST, POS_PORT, POS_API_KEY)
 * - Invio richiesta di pagamento al terminale
 * - Polling/callback per esito transazione
 * - Gestione timeout e retry
 * - Stampa scontrino (opzionale, delegabile al terminale)
 *
 * Vedi ADR-0002.7 per il design.
 */

async function charge(/* { amount, currency, orderId, metadata } */) {
  const err = new Error(
    'NotImplementedError: POS strategy non ancora implementata. ' +
    'Configurare un terminale POS e implementare la connessione.'
  );
  err._resCode = 'PAYMENT_UNAVAILABLE';
  throw err;
}

module.exports = { charge };

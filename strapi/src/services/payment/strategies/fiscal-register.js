'use strict';

/**
 * Payment strategy: Cassa fiscale / Registratore telematico.
 *
 * Stub — interfaccia pronta per integrazione con registratori telematici (RT)
 * per emissione scontrino fiscale e invio dati all'Agenzia delle Entrate.
 *
 * TODO: Implementare connessione al registratore telematico:
 * - Configurazione endpoint RT via env (FISCAL_HOST, FISCAL_PORT, FISCAL_API_KEY)
 * - Invio documento commerciale (scontrino) con dettaglio items
 * - Ricezione numero scontrino e codice lotteria
 * - Gestione aliquote IVA multiple (4%, 10%, 22%)
 * - Chiusura giornaliera (Z report)
 * - Conformita normativa italiana (D.Lgs. 127/2015)
 *
 * Vedi ADR-0002.7 per il design.
 */

async function charge(/* { amount, currency, orderId, metadata } */) {
  const err = new Error(
    'NotImplementedError: Fiscal register strategy non ancora implementata. ' +
    'Configurare un registratore telematico e implementare la connessione.'
  );
  err._resCode = 'PAYMENT_UNAVAILABLE';
  throw err;
}

module.exports = { charge };

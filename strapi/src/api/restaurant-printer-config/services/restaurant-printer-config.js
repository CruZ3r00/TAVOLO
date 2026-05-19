'use strict';

/**
 * restaurant-printer-config service
 *
 * Gestisce il caricamento e la serializzazione della configurazione stampanti
 * per un ristorante. Ogni ristoratore ha un record singleton (1-1 con User).
 */

const CT_API = 'api::restaurant-printer-config.restaurant-printer-config';

/**
 * Carica la config stampanti per un userId. Ritorna il record Strapi o null.
 */
async function loadForUser(userId) {
  if (!userId) return null;
  const results = await strapi.documents(CT_API).findMany({
    filters: { fk_user: { id: { $eq: userId } } },
    limit: 1,
  });
  return results[0] || null;
}

/**
 * Struttura di default ritornata se il ristoratore non ha ancora configurato
 * nulla. Corrisponde al comportamento pre-esistente (stampa attiva, nessuna
 * stampante configurata).
 */
function defaultConfig() {
  return {
    auto_print_kitchen_enabled: true,
    stations_json: {},
    cash_devices_json: [],
  };
}

/**
 * Trasforma il record DB in un array piatto `printer_targets[]` consumabile
 * dal daemon pos-rt-service.
 *
 * Ogni entry ha: { role, key, driver, host, port, options, capabilities, enabled }
 *   - role='station' + key=<nome stazione> per stampanti di stazione
 *   - role='cash' + key=<id device> per dispositivi cassa
 */
function serializeForDevice(record) {
  const targets = [];
  const stations = record?.stations_json || {};
  const cashDevices = record?.cash_devices_json || [];

  // Stampanti di stazione
  for (const [stationKey, cfg] of Object.entries(stations)) {
    if (!cfg || typeof cfg !== 'object') continue;
    targets.push({
      role: 'station',
      key: stationKey,
      driver: cfg.driver || null,
      host: cfg.host || null,
      port: cfg.port != null ? Number(cfg.port) : null,
      options: cfg.options || {},
      capabilities: {},
      enabled: cfg.enabled !== false,
    });
  }

  // Dispositivi cassa
  if (Array.isArray(cashDevices)) {
    for (const dev of cashDevices) {
      if (!dev || typeof dev !== 'object') continue;
      targets.push({
        role: 'cash',
        key: dev.id || dev.label || `cash_${targets.length}`,
        driver: dev.driver || null,
        host: dev.host || null,
        port: dev.port != null ? Number(dev.port) : null,
        options: dev.options || {},
        capabilities: {
          can_charge: dev.can_charge === true,
          can_print_receipt: dev.can_print_receipt === true,
          can_print_fiscal: dev.can_print_fiscal === true,
          accepted_methods: Array.isArray(dev.accepted_methods) ? dev.accepted_methods : [],
        },
        enabled: dev.enabled !== false,
      });
    }
  }

  return targets;
}

module.exports = { loadForUser, defaultConfig, serializeForDevice };

'use strict';

/**
 * restaurant-printer-config controller
 *
 * Gestisce la configurazione delle stampanti di stazione e dei dispositivi
 * cassa per il ristorante corrente. Endpoint custom (no core controller):
 *   GET  /api/restaurant-printer-config/me
 *   PUT  /api/restaurant-printer-config/me
 *   POST /api/restaurant-printer-config/test-print
 */

const { ownerHasProfessionalRouting } = require('../../../utils/category-routing');
const posBridge = require('../../../services/pos-bridge');
const {
  loadForUser,
  defaultConfig,
  serializeForDevice,
} = require('../services/restaurant-printer-config');

const CT_API = 'api::restaurant-printer-config.restaurant-printer-config';

/** Stazioni valide per piano starter (solo cucina). */
const STARTER_STATIONS = new Set(['cucina']);

/** Tutte le stazioni valide (piano pro). */
const ALL_STATIONS = new Set(['cucina', 'bar', 'pizzeria', 'cucina_sg']);

/**
 * Invia la config stampanti aggiornata al device via WS (best-effort).
 */
async function pushPrinterConfigToDevice(userId) {
  try {
    const device = await posBridge.findActiveDeviceForUser(strapi, userId);
    if (!device) return;
    const hub = strapi.__posWsHub;
    if (!hub || !hub.isConnected(device.id)) return;

    const record = await loadForUser(userId);
    const cfg = record || defaultConfig();
    const printerTargets = serializeForDevice(cfg);

    hub.push(device.id, {
      type: 'config.update',
      config: {
        printer_targets: printerTargets,
        auto_print_kitchen_enabled: cfg.auto_print_kitchen_enabled !== false,
      },
    });
  } catch (err) {
    strapi.log.warn(`pushPrinterConfigToDevice: push fallito per user ${userId}: ${err.message}`);
  }
}

module.exports = {
  /**
   * GET /api/restaurant-printer-config/me
   * Ritorna la configurazione stampanti del ristoratore autenticato.
   * Se non esiste, ritorna la struct di default.
   */
  async findMe(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const record = await loadForUser(user.id);
      const cfg = record || defaultConfig();
      const isPro = ownerHasProfessionalRouting(user);

      ctx.body = {
        data: {
          auto_print_kitchen_enabled: cfg.auto_print_kitchen_enabled !== false,
          stations_json: cfg.stations_json || {},
          cash_devices_json: cfg.cash_devices_json || [],
          plan: isPro ? 'pro' : 'starter',
        },
      };
    } catch (err) {
      strapi.log.error(`restaurant-printer-config findMe: ${err.message}`);
      ctx.throw(500, 'Errore interno nel caricamento configurazione stampanti.');
    }
  },

  /**
   * PUT /api/restaurant-printer-config/me
   * Crea o aggiorna la configurazione stampanti.
   * Gating: piano starter puo' configurare solo la stazione 'cucina'.
   */
  async upsertMe(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const body = ctx.request.body || {};
      const isPro = ownerHasProfessionalRouting(user);

      // Validazione stations_json
      const stationsInput = body.stations_json;
      if (stationsInput && typeof stationsInput === 'object' && !Array.isArray(stationsInput)) {
        const stationKeys = Object.keys(stationsInput);

        // Verifica che tutte le chiavi siano stazioni valide
        for (const key of stationKeys) {
          if (!ALL_STATIONS.has(key)) {
            ctx.status = 422;
            ctx.body = {
              error: {
                code: 'INVALID_PAYLOAD',
                message: `Stazione "${key}" non valida. Stazioni ammesse: ${[...ALL_STATIONS].join(', ')}.`,
              },
            };
            return;
          }
        }

        // Gating starter: solo cucina
        if (!isPro) {
          const nonStarter = stationKeys.filter((k) => !STARTER_STATIONS.has(k));
          if (nonStarter.length > 0) {
            ctx.status = 422;
            ctx.body = {
              error: {
                code: 'INVALID_PAYLOAD',
                message: `Il piano Essenziale supporta solo la stazione cucina. Stazioni non ammesse: ${nonStarter.join(', ')}. Passa al piano Professionale per configurare bar, pizzeria e cucina senza glutine.`,
              },
            };
            return;
          }
        }
      }

      // Prepara i dati da salvare
      const data = {};
      if (body.auto_print_kitchen_enabled !== undefined) {
        data.auto_print_kitchen_enabled = body.auto_print_kitchen_enabled === true;
      }
      if (stationsInput !== undefined) {
        data.stations_json = stationsInput;
      }
      if (body.cash_devices_json !== undefined) {
        data.cash_devices_json = body.cash_devices_json;
      }

      // Upsert: cerca record esistente o crea nuovo
      const existing = await loadForUser(user.id);

      let saved;
      if (existing) {
        saved = await strapi.documents(CT_API).update({
          documentId: existing.documentId,
          data,
        });
      } else {
        saved = await strapi.documents(CT_API).create({
          data: {
            ...defaultConfig(),
            ...data,
            fk_user: { connect: [{ id: user.id }] },
          },
        });
      }

      // Push config al device (best-effort, non-bloccante)
      pushPrinterConfigToDevice(user.id);

      ctx.body = {
        data: {
          auto_print_kitchen_enabled: saved.auto_print_kitchen_enabled !== false,
          stations_json: saved.stations_json || {},
          cash_devices_json: saved.cash_devices_json || [],
          plan: isPro ? 'pro' : 'starter',
        },
      };
    } catch (err) {
      strapi.log.error(`restaurant-printer-config upsertMe: ${err.message}`);
      ctx.throw(500, 'Errore interno nel salvataggio configurazione stampanti.');
    }
  },

  /**
   * POST /api/restaurant-printer-config/test-print
   * Accoda un job di test stampa verso la stampante specificata.
   * Body: { role: 'station'|'cash', key: '<nome stazione o id device>' }
   */
  async testPrint(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const { role, key } = ctx.request.body || {};

      if (!role || !key) {
        ctx.status = 400;
        ctx.body = {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Parametri "role" e "key" obbligatori.',
          },
        };
        return;
      }

      if (role !== 'station' && role !== 'cash') {
        ctx.status = 400;
        ctx.body = {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Il parametro "role" deve essere "station" o "cash".',
          },
        };
        return;
      }

      const device = await posBridge.findActiveDeviceForUser(strapi, user.id);
      if (!device) {
        ctx.status = 503;
        ctx.body = {
          error: {
            code: 'DEVICE_UNAVAILABLE',
            message: 'Nessun dispositivo POS/RT attivo. Verifica che il servizio sia in esecuzione e collegato.',
          },
        };
        return;
      }

      // Costruisci payload di test in base al ruolo
      let kind;
      let payload;

      if (role === 'station') {
        kind = 'print.kitchen_ticket';
        payload = {
          target: { role: 'station', key },
          action: 'add',
          station: key,
          title: 'TEST STAMPA',
          printed_at: new Date().toISOString(),
          order: {
            documentId: 'test-order',
            service_type: 'table',
            opened_at: new Date().toISOString(),
          },
          table: {
            documentId: 'test-table',
            number: 99,
            area: 'interno',
          },
          takeaway: null,
          items: [
            {
              name: 'TEST STAMPA - Piatto di prova',
              quantity: 2,
              price: 10.5,
              category: key === 'cucina' ? 'Primi' : key === 'bar' ? 'Bevande' : 'Pizze',
              course: 1,
              notes: 'Questo e\' un test di stampa.',
              element_document_id: null,
            },
          ],
        };
      } else {
        // role === 'cash'
        kind = 'print.receipt';
        payload = {
          target: { role: 'cash', key },
          title: 'TEST STAMPA CASSA',
          printed_at: new Date().toISOString(),
          items: [
            { name: 'Piatto di prova', quantity: 1, price: 10.0 },
            { name: 'Bevanda di prova', quantity: 2, price: 3.5 },
          ],
          subtotal: 17.0,
          total: 17.0,
          payment_method: 'test',
        };
      }

      const result = await posBridge.dispatchJob(strapi, {
        device,
        user: { id: user.id },
        kind,
        priority: 10,
        payload,
      });

      ctx.body = {
        data: {
          dispatched: true,
          delivered_via_ws: result.delivered_via_ws,
          event_id: result.event_id,
        },
      };
    } catch (err) {
      strapi.log.error(`restaurant-printer-config testPrint: ${err.message}`);
      ctx.throw(500, 'Errore interno durante il test di stampa.');
    }
  },
};

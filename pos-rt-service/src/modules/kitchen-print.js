'use strict';

const { z } = require('zod');
const { getLogger } = require('../utils/logger');
const { AppError, CODES } = require('../utils/errors');
const { parseOrThrow } = require('../utils/validation');
const auditRepo = require('../storage/repositories/auditRepo');

const log = getLogger('modules/kitchen-print');

/**
 * Schema di validazione per il payload print.kitchen_ticket.
 */
const kitchenTicketPayloadSchema = z.object({
  target: z
    .object({
      role: z.enum(['station', 'cash']).optional(),
      key: z.string().min(1).optional(),
    })
    .optional(),
  station: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      course: z.number().optional(),
      notes: z.string().optional(),
      price: z.number().optional(),
      addons: z.array(z.object({
        name: z.string(),
        price: z.number().optional(),
        qty_used: z.number().optional(),
      })).optional(),
    }),
  ).min(0),
  action: z.enum(['add', 'update', 'cancel', 'reprint']).optional().default('add'),
  title: z.string().optional(),
  printed_at: z.string().optional(),
  table: z
    .object({
      number: z.union([z.string(), z.number()]).optional(),
      area: z.string().optional(),
    })
    .optional(),
  takeaway: z
    .object({
      customer_name: z.string().optional(),
      pickup_at: z.string().optional(),
    })
    .optional(),
});

/**
 * Handler per print.kitchen_ticket: stampa comanda di stazione.
 *
 * Flusso:
 *   1. Valida payload (zod)
 *   2. Resolve station da payload.target.key || payload.station || 'cucina'
 *   3. Ottieni driver da driverRegistry.getPrinterForStation(station)
 *   4. Se driver ha printKitchenTicket() -> usa quello
 *   5. Altrimenti fallback a printReceipt con header formattato
 *   6. Audit event
 */
function createPrintKitchenTicketHandler({ driverRegistry }) {
  return async function handlePrintKitchenTicket(payload, { job }) {
    const data = parseOrThrow(kitchenTicketPayloadSchema, payload);

    // Resolve station
    const station = (data.target?.key || data.station || 'cucina').trim().toLowerCase();

    // Get driver
    const driver = driverRegistry.getPrinterForStation(station);
    if (!driver) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, `Nessun driver stampante per station "${station}"`);
    }

    log.info(
      {
        event_id: job.event_id,
        station,
        items_count: data.items?.length || 0,
        action: data.action,
        has_dedicated_driver: typeof driver.printKitchenTicket === 'function',
      },
      'Kitchen ticket handler',
    );

    let outcome;
    const ticketData = {
      station,
      items: data.items || [],
      action: data.action || 'add',
      title: data.title,
      printed_at: data.printed_at || new Date().toISOString(),
      table: data.table,
      takeaway: data.takeaway,
    };

    try {
      if (typeof driver.printKitchenTicket === 'function') {
        outcome = await driver.printKitchenTicket(ticketData);
      } else {
        // Fallback: usa printReceipt con header strutturato
        const header = `COMANDA ${station.toUpperCase()}`;
        const items = [];
        for (const it of (data.items || [])) {
          items.push({
            name: `${data.action === 'cancel' ? 'ANNULLA ' : data.action === 'update' ? 'MODIFICA ' : ''}${it.name || it.description || 'Voce'}`,
            quantity: it.quantity || 1,
            unit_price: it.price || 0,
          });
          // Righe addon indentate sotto al piatto
          if (Array.isArray(it.addons) && it.addons.length > 0) {
            for (const addon of it.addons) {
              items.push({
                name: `  + ${addon.name}`,
                quantity: it.quantity || 1,
                unit_price: addon.price || 0,
              });
            }
          }
        }
        const footer = [
          data.table?.number != null ? `Tavolo ${data.table.number}` : null,
          data.takeaway?.customer_name ? `Asporto: ${data.takeaway.customer_name}` : null,
          ticketData.printed_at,
        ]
          .filter(Boolean)
          .join(' | ');

        outcome = await driver.printReceipt({
          header,
          items,
          footer,
        });
      }
    } catch (err) {
      auditRepo.append({
        kind: 'kitchen_ticket.print_failed',
        eventId: job.event_id,
        payload: { station, items_count: data.items?.length || 0, action: data.action },
        meta: { error: err.message },
      });
      throw err;
    }

    auditRepo.append({
      kind: 'kitchen_ticket.printed',
      eventId: job.event_id,
      payload: { station, items_count: data.items?.length || 0, action: data.action },
      meta: { receipt_no: outcome?.receipt_no, driver: outcome?.driver },
    });

    return {
      station,
      receipt_no: outcome?.receipt_no,
      driver: outcome?.driver,
      printed_at: ticketData.printed_at,
      items_count: data.items?.length || 0,
    };
  };
}

module.exports = { createPrintKitchenTicketHandler, kitchenTicketPayloadSchema };

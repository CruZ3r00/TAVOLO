'use strict';

/**
 * reservation controller
 *
 * Gestisce le prenotazioni tavolo con prevenzione overbooking via
 * transazione Knex + row-level lock, state machine esplicita e rate limit
 * sulla route pubblica. Vedi `docs/adr/0001-reservations-system.md`.
 *
 * Dal refactor "host-centric" (2026-04), l'accoglienza e' interamente
 * gestita dalla pagina Prenotazioni:
 *   - `POST /reservations/:documentId/seat` fa accomodare un cliente su
 *     un tavolo libero, promuove `confirmed|pending -> at_restaurant` e
 *     apre automaticamente un Order.
 *   - `POST /reservations/walkin` registra in un'unica operazione un
 *     walk-in (prenotazione flash `at_restaurant` + ordine aperto).
 *
 * La transizione `-> at_restaurant` via PATCH /status e' disabilitata:
 * deve sempre passare per `seat` per garantire l'accoppiamento con tavolo
 * e ordine. La transizione `-> completed` via PATCH /status resta valida
 * ma viene anche impostata automaticamente alla chiusura dell'ordine
 * collegato.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { errors } = require('@strapi/utils');

const { capacityFor } = require('../../../utils/season');
const { computeSlotStart, composeDatetime } = require('../../../utils/reservation-slot');
const {
  withRetry,
  getDialect,
  isSqlite,
  lockWebsiteConfig,
  lockActiveReservations,
} = require('../../../utils/db-lock');
const { openOrderForTableTx } = require('../../../utils/order-lifecycle');

const { ApplicationError } = errors;

/** Stati che occupano capacità nello slot. */
const OCCUPYING_STATUSES = ['confirmed', 'at_restaurant'];

/** FSM: transizioni ammesse via PATCH /status (at_restaurant lo imposta `seat`). */
const ALLOWED_TRANSITIONS = {
  pending:       ['confirmed', 'cancelled'],
  confirmed:     ['cancelled'],
  at_restaurant: ['completed'],
  completed:     [],
  cancelled:     [],
};

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);
const STATUS_ENUM = ['pending', 'confirmed', 'at_restaurant', 'completed', 'cancelled'];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  INVALID_TRANSITION: 400,
  NOT_OWNER: 403,
  RESTAURANT_NOT_FOUND: 404,
  RESERVATION_NOT_FOUND: 404,
  TABLE_NOT_FOUND: 404,
  OVERBOOKING: 409,
  CAPACITY_NOT_CONFIGURED: 409,
  TABLE_ALREADY_OCCUPIED: 409,
  RESERVATION_ALREADY_SEATED: 409,
  RESERVATION_CONTENTION: 503,
};

function appError(code, message, details) {
  const err = new ApplicationError(message, details ? { code, details } : { code });
  err._resCode = code;
  return err;
}

function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw appError(
      'INVALID_TRANSITION',
      `Transizione non ammessa: ${from} -> ${to}.`,
      { from, to, allowed }
    );
  }
}

function validateCreatePayload(body, { phoneOptional = false } = {}) {
  if (!body || typeof body !== 'object') {
    throw appError('INVALID_PAYLOAD', 'Body mancante o non oggetto.');
  }
  const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  if (!customer_name) throw appError('INVALID_PAYLOAD', 'customer_name obbligatorio.');
  if (customer_name.length > 120) throw appError('INVALID_PAYLOAD', 'customer_name troppo lungo.');

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phoneOptional && !phone) throw appError('INVALID_PAYLOAD', 'phone obbligatorio.');
  if (phone.length > 32) throw appError('INVALID_PAYLOAD', 'phone troppo lungo.');

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw appError('INVALID_PAYLOAD', 'date obbligatoria nel formato YYYY-MM-DD.');
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    throw appError('INVALID_PAYLOAD', 'time obbligatoria nel formato HH:MM o HH:MM:SS.');
  }

  let datetimeISO;
  try {
    datetimeISO = composeDatetime(date, time);
  } catch (_e) {
    throw appError('INVALID_PAYLOAD', 'Combinazione date/time non valida.');
  }

  const number_of_people = parseInt(body.number_of_people, 10);
  if (!Number.isFinite(number_of_people) || number_of_people < 1 || number_of_people > 1000) {
    throw appError('INVALID_PAYLOAD', 'number_of_people deve essere 1..1000.');
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

  return {
    customer_name,
    phone: phone || null,
    date,
    time: time.length === 5 ? `${time}:00` : time,
    datetime: datetimeISO,
    number_of_people,
    notes: notes && notes.length ? notes : null,
  };
}

function serializeTable(t) {
  if (!t) return null;
  return {
    documentId: t.documentId,
    number: t.number,
    seats: t.seats,
    area: t.area || 'interno',
    status: t.status || 'free',
  };
}

function serializeOrderRef(o) {
  if (!o) return null;
  return {
    documentId: o.documentId,
    status: o.status,
    total_amount: o.total_amount,
    opened_at: o.opened_at,
    closed_at: o.closed_at || null,
    lock_version: o.lock_version,
  };
}

function serializeReservation(row) {
  if (!row) return null;
  return {
    documentId: row.documentId,
    customer_name: row.customer_name,
    phone: row.phone,
    date: row.date,
    time: row.time,
    datetime: row.datetime,
    slot_start: row.slot_start,
    number_of_people: row.number_of_people,
    notes: row.notes || null,
    status: row.status,
    is_walkin: !!row.is_walkin,
    table: serializeTable(row.fk_table),
    order: serializeOrderRef(row.fk_order),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sendError(ctx, err) {
  const code = err && err._resCode ? err._resCode : null;
  if (code && ERROR_STATUS[code]) {
    const details = err.details && err.details.details ? err.details.details : undefined;
    const body = { error: { code, message: err.message } };
    if (details) body.error.details = details;
    ctx.status = ERROR_STATUS[code];
    ctx.body = body;
    return;
  }
  strapi.log.error('reservation controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

/**
 * Carica una reservation con populate utili, scoped su user.
 */
async function loadReservation(documentId, userId) {
  const results = await strapi.documents('api::reservation.reservation').findMany({
    filters: {
      documentId: { $eq: documentId },
      fk_user: { id: { $eq: userId } },
    },
    populate: ['fk_user', 'fk_table', 'fk_order'],
    limit: 1,
  });
  if (results && results.length > 0) return results[0];

  const existing = await strapi.db.query('api::reservation.reservation').findOne({
    where: { documentId },
    select: ['id'],
  });
  if (existing) throw appError('NOT_OWNER', 'Non autorizzato.');
  throw appError('RESERVATION_NOT_FOUND', 'Prenotazione non trovata.');
}

/**
 * Crea un tavolo automaticamente dentro una transazione esistente.
 * Verifica la capienza (coperti vs ordini attivi) a meno che `force=true`.
 * Ritorna il documentId del tavolo creato.
 */
async function autoCreateTableTx({ trx, userId, people, force, dialect }) {
  await lockWebsiteConfig(trx, userId, dialect);

  const wcRows = await trx('website_configs as wc')
    .innerJoin('website_configs_fk_user_lnk as lnk', 'lnk.website_config_id', 'wc.id')
    .where('lnk.user_id', userId)
    .limit(1)
    .select('wc.*');
  if (!wcRows || wcRows.length === 0) {
    throw appError('RESTAURANT_NOT_FOUND', 'Ristorante non trovato.');
  }
  const wc = wcRows[0];
  if (!wc.coperti_invernali) {
    throw appError('CAPACITY_NOT_CONFIGURED', 'Capacità del ristorante non configurata.');
  }
  const capacity = capacityFor(wc, new Date().toISOString());
  if (capacity == null) {
    throw appError('CAPACITY_NOT_CONFIGURED', 'Capacità del ristorante non configurata.');
  }

  const occRows = await trx('orders as o')
    .innerJoin('orders_fk_user_lnk as ul', 'ul.order_id', 'o.id')
    .where('ul.user_id', userId)
    .andWhere('o.status', 'active')
    .sum({ total: 'o.covers' });
  const currentCovers = parseInt(occRows[0] && occRows[0].total, 10) || 0;

  if (!force && currentCovers + people > capacity) {
    throw appError('OVERBOOKING', 'Capienza del ristorante insufficiente.', {
      capacity,
      current: currentCovers,
      requested: people,
    });
  }

  const maxRows = await trx('tables as t')
    .innerJoin('tables_fk_user_lnk as tl', 'tl.table_id', 't.id')
    .where('tl.user_id', userId)
    .max({ max_num: 't.number' });
  const nextNumber = (parseInt(maxRows[0] && maxRows[0].max_num, 10) || 0) + 1;
  const newSeats = Math.min(Math.max(people, 1), 100);

  const newTable = await strapi.documents('api::table.table').create({
    data: {
      number: nextNumber,
      seats: newSeats,
      area: 'interno',
      status: 'free',
      fk_user: { connect: [{ id: userId }] },
    },
  });
  return newTable.documentId;
}

async function createWithCapacityCheck({ targetUserId, payload, status, enforceCapacity }) {
  const dialect = getDialect(strapi);
  const slotStartISO = computeSlotStart(payload.datetime);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      if (isSqlite(dialect)) {
        try { await trx.raw('BEGIN IMMEDIATE'); } catch (_e) { /* ok */ }
      }

      const wcRows = await trx('website_configs as wc')
        .innerJoin('website_configs_fk_user_lnk as lnk', 'lnk.website_config_id', 'wc.id')
        .where('lnk.user_id', targetUserId)
        .limit(1)
        .select('wc.*');

      if (!wcRows || wcRows.length === 0) {
        throw appError('RESTAURANT_NOT_FOUND', 'Ristorante non trovato.');
      }
      const wc = wcRows[0];

      await lockWebsiteConfig(trx, targetUserId, dialect);

      if (enforceCapacity) {
        if (!wc.coperti_invernali) {
          throw appError('CAPACITY_NOT_CONFIGURED', 'Capacità del ristorante non configurata.');
        }
        const capacity = capacityFor(wc, payload.datetime);
        if (capacity == null) {
          throw appError('CAPACITY_NOT_CONFIGURED', 'Capacità del ristorante non configurata.');
        }

        const active = await lockActiveReservations(
          trx, targetUserId, slotStartISO, OCCUPYING_STATUSES, dialect
        );
        const currentGuests = active.reduce((sum, r) => sum + (r.number_of_people || 0), 0);

        if (currentGuests + payload.number_of_people > capacity) {
          throw appError('OVERBOOKING', 'Capienza dello slot insufficiente.', {
            capacity,
            current: currentGuests,
            requested: payload.number_of_people,
            slot_start: slotStartISO,
          });
        }
      }

      const created = await strapi.documents('api::reservation.reservation').create({
        data: {
          customer_name: payload.customer_name,
          phone: payload.phone,
          date: payload.date,
          time: payload.time,
          datetime: payload.datetime,
          slot_start: slotStartISO,
          number_of_people: payload.number_of_people,
          notes: payload.notes,
          status,
          is_walkin: false,
          fk_user: { connect: [{ id: targetUserId }] },
        },
      });

      return created;
    });
  }, { maxAttempts: 3 }).catch((err) => {
    if (err && err._resCode) throw err;
    throw appError('RESERVATION_CONTENTION', 'Contesa DB, riprova.');
  });
}

module.exports = createCoreController('api::reservation.reservation', ({ strapi }) => ({

  /**
   * POST /api/reservations
   * Creazione dal gestionale (owner).
   */
  async createAuthenticated(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const payload = validateCreatePayload(ctx.request.body);
      const requestedStatus = ctx.request.body && ctx.request.body.status;
      let status = 'confirmed';
      if (requestedStatus) {
        if (!['pending', 'confirmed'].includes(requestedStatus)) {
          throw appError('INVALID_PAYLOAD', 'status iniziale non valido (pending|confirmed).');
        }
        status = requestedStatus;
      }

      const created = await createWithCapacityCheck({
        targetUserId: user.id,
        payload,
        status,
        enforceCapacity: true,
      });

      const full = await loadReservation(created.documentId, user.id);

      ctx.status = 201;
      ctx.body = { data: serializeReservation(full) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/reservations/public/:userDocumentId
   */
  async createPublic(ctx) {
    try {
      const { userDocumentId } = ctx.params;
      if (!userDocumentId) {
        throw appError('INVALID_PAYLOAD', 'userDocumentId mancante.');
      }

      const users = await strapi.db
        .query('plugin::users-permissions.user')
        .findMany({ where: { documentId: userDocumentId }, limit: 1 });

      if (!users || users.length === 0) {
        throw appError('RESTAURANT_NOT_FOUND', 'Ristorante non trovato.');
      }
      const targetUser = users[0];

      const payload = validateCreatePayload(ctx.request.body);

      const created = await createWithCapacityCheck({
        targetUserId: targetUser.id,
        payload,
        status: 'pending',
        enforceCapacity: process.env.PUBLIC_RESERVATIONS_ENFORCE_CAPACITY !== 'false',
      });

      ctx.status = 201;
      ctx.body = { data: serializeReservation(created) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/reservations
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const q = ctx.request.query || {};

      const statusFilter = typeof q.status === 'string' && q.status.trim()
        ? q.status.split(',').map((s) => s.trim()).filter((s) => STATUS_ENUM.includes(s))
        : null;

      const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : null;
      const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : null;
      if (from && Number.isNaN(new Date(from).getTime())) {
        throw appError('INVALID_PAYLOAD', 'from non valido.');
      }
      if (to && Number.isNaN(new Date(to).getTime())) {
        throw appError('INVALID_PAYLOAD', 'to non valido.');
      }

      const pageRaw = parseInt(q.page, 10);
      const pageSizeRaw = parseInt(q.pageSize, 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const pageSize = Math.min(
        Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      );

      const filters = { fk_user: { id: { $eq: user.id } } };
      if (statusFilter && statusFilter.length) {
        filters.status = { $in: statusFilter };
      }
      if (from || to) {
        filters.datetime = {};
        if (from) filters.datetime.$gte = from;
        if (to) filters.datetime.$lt = to;
      }

      const [results, total] = await Promise.all([
        strapi.documents('api::reservation.reservation').findMany({
          filters,
          populate: ['fk_table', 'fk_order'],
          sort: ['datetime:asc'],
          pagination: { page, pageSize },
        }),
        strapi.documents('api::reservation.reservation').count({ filters }),
      ]);

      ctx.body = {
        data: (results || []).map(serializeReservation),
        meta: {
          pagination: {
            page,
            pageSize,
            total,
            pageCount: Math.ceil(total / pageSize),
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/reservations/:documentId/status
   * FSM esplicita. `at_restaurant` NON accettabile qui: usare POST /seat.
   */
  async updateStatus(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const { documentId } = ctx.params;
      const body = ctx.request.body || {};
      const nextStatus = typeof body.status === 'string' ? body.status : null;

      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');
      if (!nextStatus || !STATUS_ENUM.includes(nextStatus)) {
        throw appError('INVALID_PAYLOAD', `status richiesto (uno fra ${STATUS_ENUM.join(', ')}).`);
      }
      if (nextStatus === 'at_restaurant') {
        throw appError('INVALID_TRANSITION', 'Per far accomodare usa POST /reservations/:documentId/seat.');
      }

      const reservation = await loadReservation(documentId, user.id);

      if (TERMINAL_STATUSES.has(reservation.status)) {
        throw appError('INVALID_TRANSITION', 'Prenotazione già in stato terminale.', {
          from: reservation.status,
          to: nextStatus,
        });
      }

      assertTransition(reservation.status, nextStatus);

      const updated = await strapi.documents('api::reservation.reservation').update({
        documentId: reservation.documentId,
        data: { status: nextStatus },
      });

      const reloaded = await loadReservation(updated.documentId, user.id);
      ctx.body = { data: serializeReservation(reloaded) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/reservations/:documentId/seat
   * Fa accomodare il cliente: tavolo → occupied, reservation → at_restaurant,
   * apre un Order collegato. Atomico.
   *
   * Body: { table_id (documentId), covers? }
   */
  async seat(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const body = ctx.request.body || {};
      const rawTableId = typeof body.table_id === 'string' ? body.table_id.trim() : '';
      const autoCreateTable = !rawTableId || rawTableId === 'auto';
      const tableDocIdInput = autoCreateTable ? '' : rawTableId;
      const force = body.force === true || body.force === 'true';

      const coversRaw = body.covers !== undefined ? parseInt(body.covers, 10) : null;
      if (coversRaw !== null && (!Number.isFinite(coversRaw) || coversRaw < 1 || coversRaw > 1000)) {
        throw appError('INVALID_PAYLOAD', 'covers deve essere 1..1000.');
      }

      const reservation = await loadReservation(documentId, user.id);

      if (reservation.status === 'at_restaurant') {
        throw appError('RESERVATION_ALREADY_SEATED', 'Prenotazione gia in sala.');
      }
      if (!['pending', 'confirmed'].includes(reservation.status)) {
        throw appError('INVALID_TRANSITION',
          `Impossibile far accomodare da stato ${reservation.status}.`,
          { from: reservation.status, to: 'at_restaurant' });
      }

      const dialect = getDialect(strapi);
      const effectiveCovers = coversRaw || reservation.number_of_people;
      const people = reservation.number_of_people;

      const result = await withRetry(async () => {
        return strapi.db.transaction(async ({ trx }) => {
          if (isSqlite(dialect)) {
            try { await trx.raw('BEGIN IMMEDIATE'); } catch (_e) { /* ok */ }
          }

          let effectiveTableDocId = tableDocIdInput;
          if (autoCreateTable) {
            effectiveTableDocId = await autoCreateTableTx({
              trx,
              userId: user.id,
              people,
              force,
              dialect,
            });
          }

          const { order } = await openOrderForTableTx({
            trx,
            userId: user.id,
            tableDocumentId: effectiveTableDocId,
            covers: effectiveCovers,
            reservationId: reservation.id,
            dialect,
          });

          const tableDocs = await strapi.documents('api::table.table').findMany({
            filters: { documentId: { $eq: effectiveTableDocId } },
            limit: 1,
          });
          const tableInternalId = tableDocs && tableDocs.length > 0 ? tableDocs[0].id : null;

          await strapi.documents('api::reservation.reservation').update({
            documentId: reservation.documentId,
            data: {
              status: 'at_restaurant',
              fk_table: tableInternalId ? { connect: [{ id: tableInternalId }] } : undefined,
              fk_order: { connect: [{ id: order.id }] },
            },
          });

          return order;
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('RESERVATION_CONTENTION', 'Contesa DB, riprova.');
      });

      const reloaded = await loadReservation(reservation.documentId, user.id);

      ctx.status = 201;
      ctx.body = {
        data: {
          reservation: serializeReservation(reloaded),
          order: { documentId: result.documentId },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/reservations/walkin
   * Registra un cliente senza prenotazione: crea Reservation flash in
   * stato `at_restaurant` + Order aperto sul tavolo scelto. Atomico.
   *
   * Body: { table_id?, number_of_people, customer_name?, phone?, covers?, notes? }
   *
   * Se `table_id` è assente, il sistema crea automaticamente un nuovo
   * tavolo (numero successivo, posti = number_of_people, area 'interno')
   * dopo aver verificato la capienza del ristorante (coperti vs ordini
   * attivi). L'operazione è atomica dentro la stessa transazione.
   */
  async walkin(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const body = ctx.request.body || {};
      const tableDocIdInput = typeof body.table_id === 'string' && body.table_id.trim() !== 'auto'
        ? body.table_id.trim()
        : '';
      const autoCreateTable = !tableDocIdInput;
      const force = body.force === true || body.force === 'true';

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const currentDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const nowISO = now.toISOString();

      const payload = validateCreatePayload({
        customer_name: body.customer_name,
        phone: body.phone,
        date: currentDate,
        time: currentTime,
        number_of_people: body.number_of_people,
        notes: body.notes,
      }, { phoneOptional: true });

      const coversRaw = body.covers !== undefined ? parseInt(body.covers, 10) : null;
      if (coversRaw !== null && (!Number.isFinite(coversRaw) || coversRaw < 1 || coversRaw > 1000)) {
        throw appError('INVALID_PAYLOAD', 'covers deve essere 1..1000.');
      }

      const slotStart = computeSlotStart(payload.datetime);
      const dialect = getDialect(strapi);
      const effectiveCovers = coversRaw || payload.number_of_people;
      const people = payload.number_of_people;

      const result = await withRetry(async () => {
        return strapi.db.transaction(async ({ trx }) => {
          if (isSqlite(dialect)) {
            try { await trx.raw('BEGIN IMMEDIATE'); } catch (_e) { /* ok */ }
          }

          let effectiveTableDocId = tableDocIdInput;

          if (autoCreateTable) {
            effectiveTableDocId = await autoCreateTableTx({
              trx,
              userId: user.id,
              people,
              force,
              dialect,
            });
          }

          const reservation = await strapi.documents('api::reservation.reservation').create({
            data: {
              customer_name: payload.customer_name,
              phone: payload.phone,
              date: payload.date,
              time: payload.time,
              datetime: payload.datetime,
              slot_start: slotStart,
              number_of_people: payload.number_of_people,
              notes: payload.notes,
              status: 'at_restaurant',
              is_walkin: true,
              fk_user: { connect: [{ id: user.id }] },
            },
          });

          const { order } = await openOrderForTableTx({
            trx,
            userId: user.id,
            tableDocumentId: effectiveTableDocId,
            covers: effectiveCovers,
            reservationId: reservation.id,
            dialect,
          });

          const tableDocs = await strapi.documents('api::table.table').findMany({
            filters: { documentId: { $eq: effectiveTableDocId } },
            limit: 1,
          });
          const tableInternalId = tableDocs && tableDocs.length > 0 ? tableDocs[0].id : null;

          await strapi.documents('api::reservation.reservation').update({
            documentId: reservation.documentId,
            data: {
              fk_table: tableInternalId ? { connect: [{ id: tableInternalId }] } : undefined,
              fk_order: { connect: [{ id: order.id }] },
            },
          });

          return { reservation, order };
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('RESERVATION_CONTENTION', 'Contesa DB, riprova.');
      });

      const reloaded = await loadReservation(result.reservation.documentId, user.id);

      ctx.status = 201;
      ctx.body = {
        data: {
          reservation: serializeReservation(reloaded),
          order: { documentId: result.order.documentId },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },
}));

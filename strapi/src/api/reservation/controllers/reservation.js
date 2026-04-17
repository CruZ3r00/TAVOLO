'use strict';

/**
 * reservation controller
 *
 * Gestisce le prenotazioni tavolo con prevenzione overbooking via
 * transazione Knex + row-level lock, state machine esplicita e rate limit
 * sulla route pubblica. Vedi `docs/adr/0001-reservations-system.md` per le
 * motivazioni architetturali.
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

const { ApplicationError } = errors;

/** Stati che occupano capacità nello slot. */
const OCCUPYING_STATUSES = ['confirmed', 'at_restaurant'];

/** FSM: transizioni ammesse (from -> set di to). */
const ALLOWED_TRANSITIONS = {
  pending:       ['confirmed', 'cancelled'],
  confirmed:     ['at_restaurant', 'cancelled'],
  at_restaurant: ['completed'],
  completed:     [],
  cancelled:     [],
};

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);
const STATUS_ENUM = ['pending', 'confirmed', 'at_restaurant', 'completed', 'cancelled'];

/** Cap difensivo sulla pagination (oltre non ha senso nel gestionale). */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Mappa codice errore -> HTTP status. Allineata all'ADR-0001.6.5. */
const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  INVALID_TRANSITION: 400,
  NOT_OWNER: 403,
  RESTAURANT_NOT_FOUND: 404,
  RESERVATION_NOT_FOUND: 404,
  OVERBOOKING: 409,
  CAPACITY_NOT_CONFIGURED: 409,
  RESERVATION_CONTENTION: 503,
};

/**
 * Costruisce un ApplicationError serializzabile con codice + dettagli.
 * Lo rilanciamo e lo catturiamo a monte nel try/catch del controller per
 * mappare il codice HTTP.
 */
function appError(code, message, details) {
  const err = new ApplicationError(message, details ? { code, details } : { code });
  err._resCode = code;
  return err;
}

/**
 * Rifiuta se la transizione di status non è ammessa dalla FSM.
 */
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

/**
 * Valida il payload di creazione ritornando un oggetto normalizzato, oppure
 * lancia `INVALID_PAYLOAD`.
 */
function validateCreatePayload(body) {
  if (!body || typeof body !== 'object') {
    throw appError('INVALID_PAYLOAD', 'Body mancante o non oggetto.');
  }
  const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  if (!customer_name) throw appError('INVALID_PAYLOAD', 'customer_name obbligatorio.');
  if (customer_name.length > 120) throw appError('INVALID_PAYLOAD', 'customer_name troppo lungo.');

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) throw appError('INVALID_PAYLOAD', 'phone obbligatorio.');
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
    phone,
    date,
    time: time.length === 5 ? `${time}:00` : time,
    datetime: datetimeISO,
    number_of_people,
    notes: notes && notes.length ? notes : null,
  };
}

/**
 * Proiezione pubblica della reservation (no ID interni, solo documentId).
 */
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Traduce un'eccezione interna in risposta HTTP coerente.
 */
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
 * Esegue la creazione atomica di una prenotazione che occupa capacità.
 * La transazione prende i lock descritti in ADR-0001.4 e, se il nuovo
 * numero coperti supera la capacità attiva, lancia `OVERBOOKING`.
 *
 * @param {object} params
 * @param {number} params.targetUserId id dell'utente ristoratore
 * @param {object} params.payload campi già validati (customer_name, phone,
 *   date, time, datetime, number_of_people, notes)
 * @param {string} params.status status iniziale (occupante o pending)
 * @param {boolean} params.enforceCapacity true se bisogna verificare
 *   l'overbooking (false per status pending creato dal pubblico)
 */
async function createWithCapacityCheck({ targetUserId, payload, status, enforceCapacity }) {
  const dialect = getDialect(strapi);
  const slotStartISO = computeSlotStart(payload.datetime);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      if (isSqlite(dialect)) {
        try {
          await trx.raw('BEGIN IMMEDIATE');
        } catch (_e) {
          // Knex apre già la transazione; l'upgrade a IMMEDIATE fallisce
          // se è già iniziata: accettabile, il busy-handler serializza.
        }
      }

      // Strapi v5: ownership via link table (website_configs_fk_user_lnk), NON fk_user_id.
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
          trx,
          targetUserId,
          slotStartISO,
          OCCUPYING_STATUSES,
          dialect
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
          fk_user: { connect: [{ id: targetUserId }] },
        },
      });

      return created;
    });
  }, { maxAttempts: 3 }).catch((err) => {
    if (err && err._resCode) throw err;
    // Errori ritentabili esauriti o errore DB generico.
    throw appError('RESERVATION_CONTENTION', 'Contesa DB, riprova.');
  });
}

/**
 * Transazione di update status che può riverificare capacità quando la
 * transizione promuove una pending verso uno stato occupante e non era
 * stata contata (non è il caso in v1 — pending già conta — ma lasciamo
 * la verifica per robustezza nei casi `pending -> confirmed` e per future
 * estensioni dove pending non occupi).
 *
 * Se `willOccupy` è true e la reservation passa da uno stato non occupante
 * a uno occupante, la capacità viene riverificata nella stessa transazione.
 */
async function updateStatusTx({ reservation, nextStatus, userId }) {
  const dialect = getDialect(strapi);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      if (isSqlite(dialect)) {
        try { await trx.raw('BEGIN IMMEDIATE'); } catch (_e) { /* already begun */ }
      }

      const wasOccupying = OCCUPYING_STATUSES.includes(reservation.status) || reservation.status === 'pending';
      const willOccupy = OCCUPYING_STATUSES.includes(nextStatus);

      if (willOccupy && !wasOccupying) {
        // Path difensivo: oggi pending già conta (vedi ADR-0001.6.4), quindi
        // questo ramo è "morto" a meno che la policy cambi in futuro.
        // Strapi v5: ownership via link table, non fk_user_id.
        const wcRows = await trx('website_configs as wc')
          .innerJoin('website_configs_fk_user_lnk as lnk', 'lnk.website_config_id', 'wc.id')
          .where('lnk.user_id', userId)
          .limit(1)
          .select('wc.*');
        if (!wcRows || wcRows.length === 0) {
          throw appError('RESTAURANT_NOT_FOUND', 'Ristorante non trovato.');
        }
        await lockWebsiteConfig(trx, userId, dialect);
        const wc = wcRows[0];
        const capacity = capacityFor(wc, reservation.datetime);
        if (capacity == null) {
          throw appError('CAPACITY_NOT_CONFIGURED', 'Capacità del ristorante non configurata.');
        }
        const active = await lockActiveReservations(
          trx,
          userId,
          reservation.slot_start,
          OCCUPYING_STATUSES,
          dialect
        );
        const currentGuests = active
          .filter((r) => r.id !== reservation.id)
          .reduce((sum, r) => sum + (r.number_of_people || 0), 0);
        if (currentGuests + reservation.number_of_people > capacity) {
          throw appError('OVERBOOKING', 'Capienza dello slot insufficiente.', {
            capacity,
            current: currentGuests,
            requested: reservation.number_of_people,
            slot_start: reservation.slot_start,
          });
        }
      }

      const updated = await strapi.documents('api::reservation.reservation').update({
        documentId: reservation.documentId,
        data: { status: nextStatus },
      });
      return updated;
    });
  }, { maxAttempts: 3 }).catch((err) => {
    if (err && err._resCode) throw err;
    throw appError('RESERVATION_CONTENTION', 'Contesa DB, riprova.');
  });
}

module.exports = createCoreController('api::reservation.reservation', ({ strapi }) => ({
  /**
   * POST /api/reservations
   * Creazione dal gestionale. Richiede autenticazione.
   * Default status: confirmed. Ammesso pending se il ristoratore ha preso
   * nota al telefono ma non conferma ancora.
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

      ctx.status = 201;
      ctx.body = { data: serializeReservation(created) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/reservations/public/:userDocumentId
   * Creazione da sito vetrina pubblico. Nessuna auth.
   * Force status = pending. In v1 pending NON blocca la capacità (vedi
   * `enforceCapacity:false`), in linea col brief: "pending non occupa
   * coperti". Solo la promozione a confirmed attiverà il check capacità.
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
        enforceCapacity: false,
      });

      ctx.status = 201;
      ctx.body = { data: serializeReservation(created) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/reservations
   * Lista paginata delle prenotazioni dell'utente autenticato.
   * Query: status (CSV), from, to (ISO), page, pageSize.
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
   * Body: { status }. Guard: ownership + FSM + eventuale verifica capacità.
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

      const results = await strapi.documents('api::reservation.reservation').findMany({
        filters: { documentId: { $eq: documentId } },
        populate: ['fk_user'],
        limit: 1,
      });
      const reservation = results && results.length > 0 ? results[0] : null;
      if (!reservation) {
        throw appError('RESERVATION_NOT_FOUND', 'Prenotazione non trovata.');
      }
      const ownerId = reservation.fk_user && reservation.fk_user.id;
      if (ownerId !== user.id) {
        throw appError('NOT_OWNER', 'Non autorizzato.');
      }

      if (TERMINAL_STATUSES.has(reservation.status)) {
        throw appError('INVALID_TRANSITION', 'Prenotazione già in stato terminale.', {
          from: reservation.status,
          to: nextStatus,
        });
      }

      assertTransition(reservation.status, nextStatus);

      const needsLock = OCCUPYING_STATUSES.includes(nextStatus);
      let updated;
      if (needsLock) {
        updated = await updateStatusTx({
          reservation: {
            id: reservation.id,
            documentId: reservation.documentId,
            datetime: reservation.datetime,
            slot_start: reservation.slot_start,
            number_of_people: reservation.number_of_people,
            status: reservation.status,
          },
          nextStatus,
          userId: user.id,
        });
      } else {
        updated = await strapi.documents('api::reservation.reservation').update({
          documentId: reservation.documentId,
          data: { status: nextStatus },
        });
      }

      ctx.body = { data: serializeReservation(updated) };
    } catch (err) {
      sendError(ctx, err);
    }
  },
}));

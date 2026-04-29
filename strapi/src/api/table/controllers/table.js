'use strict';

/**
 * table controller
 *
 * CRUD tavoli del ristorante con multi-tenant scoping su fk_user.
 * Vincolo unicita (number, fk_user) enforced a livello applicativo.
 * Non tocca reservation ne website-config.
 *
 * Vedi ADR-0002.1 per le motivazioni.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { errors } = require('@strapi/utils');
const {
  STAFF_ROLES,
  resolveStaffContext,
  assertStaffRole,
} = require('../../../utils/staff-access');

const { ApplicationError } = errors;

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  NOT_OWNER: 403,
  TABLE_NOT_FOUND: 404,
  TABLE_ALREADY_EXISTS: 409,
  TABLE_ALREADY_OCCUPIED: 409,
};

function appError(code, message, details) {
  const err = new ApplicationError(message, details ? { code, details } : { code });
  err._resCode = code;
  return err;
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
  strapi.log.error('table controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

function serializeTable(row) {
  if (!row) return null;
  return {
    documentId: row.documentId,
    number: row.number,
    seats: row.seats,
    area: row.area || 'interno',
    status: row.status || 'free',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = createCoreController('api::table.table', ({ strapi }) => ({
  /**
   * GET /api/tables
   * Lista tavoli del ristorante corrente.
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE, STAFF_ROLES.CUCINA]);
      const results = await strapi.documents('api::table.table').findMany({
        filters: { fk_user: { id: { $eq: actor.ownerId } } },
        sort: ['number:asc'],
      });

      ctx.body = {
        data: (results || []).map(serializeTable),
        meta: { total: (results || []).length },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/tables
   * Crea un nuovo tavolo. Check unicita (number, fk_user).
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE]);
      const body = ctx.request.body || {};

      const number = parseInt(body.number, 10);
      if (!Number.isFinite(number) || number < 1) {
        throw appError('INVALID_PAYLOAD', 'number obbligatorio (intero >= 1).');
      }

      const seats = parseInt(body.seats, 10);
      if (!Number.isFinite(seats) || seats < 1 || seats > 100) {
        throw appError('INVALID_PAYLOAD', 'seats obbligatorio (1..100).');
      }

      const area = body.area || 'interno';
      if (!['interno', 'esterno'].includes(area)) {
        throw appError('INVALID_PAYLOAD', 'area non valido (interno|esterno).');
      }

      // Check unicita (number, fk_user)
      const existing = await strapi.documents('api::table.table').findMany({
        filters: {
          fk_user: { id: { $eq: actor.ownerId } },
          number: { $eq: number },
        },
        limit: 1,
      });
      if (existing && existing.length > 0) {
        throw appError('TABLE_ALREADY_EXISTS', `Tavolo numero ${number} gia esistente.`);
      }

      const created = await strapi.documents('api::table.table').create({
        data: {
          number,
          seats,
          area,
          status: 'free',
          fk_user: { connect: [{ id: actor.ownerId }] },
        },
      });

      ctx.status = 201;
      ctx.body = { data: serializeTable(created) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/tables/:documentId
   * Aggiorna tavolo. Non ammesso se occupato.
   */
  async update(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const tables = await strapi.documents('api::table.table').findMany({
        filters: { documentId: { $eq: documentId } },
        populate: ['fk_user'],
        limit: 1,
      });
      const table = tables && tables.length > 0 ? tables[0] : null;
      if (!table) throw appError('TABLE_NOT_FOUND', 'Tavolo non trovato.');
      if (!table.fk_user || table.fk_user.id !== actor.ownerId) {
        throw appError('NOT_OWNER', 'Non autorizzato.');
      }
      if (table.status === 'occupied') {
        throw appError('TABLE_ALREADY_OCCUPIED', 'Impossibile modificare un tavolo con ordine attivo.');
      }

      const body = ctx.request.body || {};
      const data = {};

      if (body.number !== undefined) {
        const number = parseInt(body.number, 10);
        if (!Number.isFinite(number) || number < 1) {
          throw appError('INVALID_PAYLOAD', 'number deve essere intero >= 1.');
        }
        // Check unicita se il numero cambia
        if (number !== table.number) {
          const dup = await strapi.documents('api::table.table').findMany({
            filters: {
              fk_user: { id: { $eq: actor.ownerId } },
              number: { $eq: number },
            },
            limit: 1,
          });
          if (dup && dup.length > 0) {
            throw appError('TABLE_ALREADY_EXISTS', `Tavolo numero ${number} gia esistente.`);
          }
        }
        data.number = number;
      }

      if (body.seats !== undefined) {
        const seats = parseInt(body.seats, 10);
        if (!Number.isFinite(seats) || seats < 1 || seats > 100) {
          throw appError('INVALID_PAYLOAD', 'seats deve essere 1..100.');
        }
        data.seats = seats;
      }

      if (body.area !== undefined) {
        if (!['interno', 'esterno'].includes(body.area)) {
          throw appError('INVALID_PAYLOAD', 'area non valido (interno|esterno).');
        }
        data.area = body.area;
      }

      if (Object.keys(data).length === 0) {
        throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare.');
      }

      const updated = await strapi.documents('api::table.table').update({
        documentId,
        data,
      });

      ctx.body = { data: serializeTable(updated) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * DELETE /api/tables/:documentId
   * Elimina tavolo. Non ammesso se occupato.
   */
  async remove(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const tables = await strapi.documents('api::table.table').findMany({
        filters: { documentId: { $eq: documentId } },
        populate: ['fk_user'],
        limit: 1,
      });
      const table = tables && tables.length > 0 ? tables[0] : null;
      if (!table) throw appError('TABLE_NOT_FOUND', 'Tavolo non trovato.');
      if (!table.fk_user || table.fk_user.id !== actor.ownerId) {
        throw appError('NOT_OWNER', 'Non autorizzato.');
      }
      if (table.status === 'occupied') {
        throw appError('TABLE_ALREADY_OCCUPIED', 'Impossibile eliminare un tavolo con ordine attivo.');
      }

      await strapi.documents('api::table.table').delete({ documentId });

      ctx.status = 204;
      ctx.body = null;
    } catch (err) {
      sendError(ctx, err);
    }
  },
}));

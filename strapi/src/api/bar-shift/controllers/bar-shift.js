'use strict';

/**
 * bar-shift controller.
 *
 * Endpoints (auth, gated dal middleware `subscription-gate.js`):
 *   - GET    /api/bar-shifts/current
 *   - GET    /api/bar-shifts/current/report
 *   - POST   /api/bar-shifts/open
 *   - POST   /api/bar-shifts/:id/close
 *   - POST   /api/bar-shifts/carico-fatto
 *   - GET    /api/bar-shifts/history
 *   - GET    /api/bar-shifts/:id
 *   - GET    /api/bar-shifts/:id/report
 *
 * Convenzioni allineate a `api/order/controllers/order.js`:
 *   - resolveStaffContext per gestire actor staff vs owner
 *   - appError(code, message) + sendError(ctx, err) per error response
 */

const barShiftService = require('../../../services/bar-shift');
const {
  STAFF_ROLES,
  resolveStaffContext,
} = require('../../../utils/staff-access');

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  NOT_OWNER: 403,
  BAR_SHIFT_NOT_FOUND: 404,
  BAR_SHIFT_NOT_OPEN: 409,
  BAR_SHIFT_ALREADY_OPEN: 409,
  BAR_SHIFT_CONTENTION: 503,
};

function sendError(strapi, ctx, err) {
  const code = err && err._resCode ? err._resCode : null;
  if (code && ERROR_STATUS[code]) {
    ctx.status = ERROR_STATUS[code];
    ctx.body = { error: { code, message: err.message } };
    return;
  }
  strapi.log.error('bar-shift controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function readNote(body) {
  if (!body || typeof body !== 'object') return null;
  const n = body.note;
  if (typeof n !== 'string') return null;
  const trimmed = n.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                           */
/* ------------------------------------------------------------------ */

module.exports = {
  /**
   * GET /api/bar-shifts/current
   * Ritorna lo shift open per l'owner, oppure null.
   */
  async getCurrent(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const shift = await barShiftService.findOpenShift(strapi, actor.ownerId);
      ctx.body = { data: shift ? barShiftService.serializeShift(shift) : null };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * GET /api/bar-shifts/current/report
   * Report del turno aperto. 409 BAR_SHIFT_NOT_OPEN se nessuno open.
   */
  async getCurrentReport(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const shift = await barShiftService.findOpenShift(strapi, actor.ownerId);
      if (!shift) {
        ctx.status = 409;
        ctx.body = { error: { code: 'BAR_SHIFT_NOT_OPEN', message: 'Nessun turno aperto.' } };
        return;
      }
      const report = await barShiftService.buildReport(strapi, actor.ownerId, shift);
      ctx.body = { data: report };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * POST /api/bar-shifts/open
   * Apre un nuovo turno. Idempotente solo nel senso di "1 turno open / owner".
   * Body: { note? }
   * Errori: 409 BAR_SHIFT_ALREADY_OPEN
   */
  async openShift(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const note = readNote(ctx.request.body);
      const shift = await barShiftService.openShift(
        strapi,
        actor.ownerId,
        actor.actor.id,
        note,
      );
      ctx.status = 201;
      ctx.body = { data: barShiftService.serializeShift(shift) };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * POST /api/bar-shifts/:id/close
   * Chiude il turno. Idempotente: chiudere uno gia chiuso ritorna lo snapshot.
   * Body: { note? }
   */
  async closeShift(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const { id } = ctx.params;
      if (!id) {
        ctx.status = 400;
        ctx.body = { error: { code: 'INVALID_PAYLOAD', message: 'id obbligatorio.' } };
        return;
      }
      const note = readNote(ctx.request.body);
      const shift = await barShiftService.closeShift(
        strapi,
        actor.ownerId,
        id,
        actor.actor.id,
        note,
      );
      ctx.body = { data: barShiftService.serializeShift(shift) };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * POST /api/bar-shifts/carico-fatto
   * Chiude il turno corrente e apre subito quello nuovo (atomic).
   * Body: { note? }
   * Errori: 409 BAR_SHIFT_NOT_OPEN
   */
  async caricoFatto(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const note = readNote(ctx.request.body);
      const result = await barShiftService.caricoFatto(
        strapi,
        actor.ownerId,
        actor.actor.id,
        note,
      );
      ctx.body = {
        data: {
          closed: barShiftService.serializeShift(result.closed),
          opened: barShiftService.serializeShift(result.opened),
          report: result.report,
        },
      };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * GET /api/bar-shifts/history?from&to&page&pageSize
   */
  async getHistory(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const q = ctx.request.query || {};
      const result = await barShiftService.listHistory(strapi, actor.ownerId, {
        from: q.from,
        to: q.to,
        page: q.page,
        pageSize: q.pageSize,
      });
      ctx.body = result;
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * GET /api/bar-shifts/:id
   */
  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const { id } = ctx.params;
      const shift = await barShiftService.getById(strapi, actor.ownerId, id);
      if (!shift) {
        ctx.status = 404;
        ctx.body = { error: { code: 'BAR_SHIFT_NOT_FOUND', message: 'Turno non trovato.' } };
        return;
      }
      ctx.body = { data: barShiftService.serializeShift(shift) };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },

  /**
   * GET /api/bar-shifts/:id/report
   * Report storico (legge dallo snapshot per turni chiusi; ricalcola per turno open).
   */
  async getReport(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      const { id } = ctx.params;
      const shift = await barShiftService.getById(strapi, actor.ownerId, id);
      if (!shift) {
        ctx.status = 404;
        ctx.body = { error: { code: 'BAR_SHIFT_NOT_FOUND', message: 'Turno non trovato.' } };
        return;
      }
      const report = shift.status === 'closed' && shift.snapshot
        ? shift.snapshot
        : await barShiftService.buildReport(strapi, actor.ownerId, shift);
      ctx.body = { data: report };
    } catch (err) {
      sendError(strapi, ctx, err);
    }
  },
};

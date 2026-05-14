'use strict';

/**
 * inventory-alert controller.
 *
 * Endpoints (auth, gated owner-only pro):
 *   - GET    /api/inventory/alerts?status=unread|all&type=predictive|threshold
 *   - POST   /api/inventory/alerts/:id/acknowledge
 *
 * La generazione avviene tramite cron 4h (services/inventory-alerts.runAlertScan).
 * La dismissione automatica dei singoli ingredienti avviene quando arriva un
 * restock per quell'ingrediente (services/inventory-alerts.dismissForRestock).
 */

const { resolveStaffContext, STAFF_ROLES } = require('../../../utils/staff-access');

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  NOT_OWNER: 403,
  ALERT_NOT_FOUND: 404,
};

function appError(code, message) {
  const err = new Error(message || code);
  err._resCode = code;
  return err;
}

function sendError(ctx, err) {
  const code = err && err._resCode ? err._resCode : null;
  if (code && ERROR_STATUS[code]) {
    ctx.status = ERROR_STATUS[code];
    ctx.body = { error: { code, message: err.message } };
    return;
  }
  strapi.log.error('inventory-alert controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

function isOwnerActor(actor) {
  return actor && actor.role === STAFF_ROLES.OWNER;
}

function serializeAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.documentId,
    alert_type: row.alert_type,
    level: row.level,
    ingredients_payload: Array.isArray(row.ingredients_payload) ? row.ingredients_payload : [],
    sent_email: row.sent_email === true,
    sent_inapp: row.sent_inapp === true,
    acknowledged_at: row.acknowledged_at || null,
    dismissed_by_restock: row.dismissed_by_restock === true,
    createdAt: row.createdAt,
  };
}

module.exports = {
  /**
   * GET /api/inventory/alerts?status=unread|all&type=predictive|threshold
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');

      const q = ctx.request.query || {};
      const where = { fk_user: { id: actor.ownerId } };
      if (q.status === 'unread') {
        where.acknowledged_at = { $null: true };
        where.dismissed_by_restock = false;
      }
      if (q.type && ['predictive', 'threshold'].includes(q.type)) {
        where.alert_type = q.type;
      }

      const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 20));
      const rows = await strapi.db.query('api::inventory-alert.inventory-alert').findMany({
        where,
        orderBy: { createdAt: 'desc' },
        limit,
      });

      // Conteggi unread per il badge
      const unreadCount = await strapi.db.query('api::inventory-alert.inventory-alert').count({
        where: {
          fk_user: { id: actor.ownerId },
          acknowledged_at: { $null: true },
          dismissed_by_restock: false,
        },
      });

      ctx.body = {
        data: rows.map(serializeAlert),
        meta: { unread_count: unreadCount },
      };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/inventory/alerts/:id/acknowledge
   * Marca acknowledged_at=now. Idempotente.
   */
  async acknowledge(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');
      const { id } = ctx.params;
      const isNumeric = /^\d+$/.test(String(id));
      const where = { fk_user: { id: actor.ownerId } };
      if (isNumeric) where.id = Number(id);
      else where.documentId = String(id);
      const row = await strapi.db.query('api::inventory-alert.inventory-alert').findOne({ where });
      if (!row) throw appError('ALERT_NOT_FOUND');

      if (row.acknowledged_at) {
        ctx.body = { data: serializeAlert(row) };
        return;
      }

      const updated = await strapi.documents('api::inventory-alert.inventory-alert').update({
        documentId: row.documentId,
        data: { acknowledged_at: new Date(), acknowledged_by: actor.actor.id },
      });
      ctx.body = { data: serializeAlert(updated) };
    } catch (err) { sendError(ctx, err); }
  },
};

'use strict';

const TAKEAWAY_SEND_LEAD_MINUTES = 15;
const TAKEAWAY_SEND_LEAD_MS = TAKEAWAY_SEND_LEAD_MINUTES * 60 * 1000;

const TAKEAWAY_STATUSES = [
  'pending_acceptance',
  'confirmed',
  'sent_to_departments',
  'ready',
  'picked_up',
  'closed',
];

function isTakeaway(order) {
  return order && order.service_type === 'takeaway';
}

function pickupDueForSend(order, now = new Date()) {
  if (!isTakeaway(order) || !order.pickup_at || order.sent_to_departments_at) return false;
  if (order.status && order.status !== 'active') return false;
  if (order.takeaway_status !== 'confirmed') return false;
  const pickup = new Date(order.pickup_at).getTime();
  if (Number.isNaN(pickup)) return false;
  return pickup <= now.getTime() + TAKEAWAY_SEND_LEAD_MS;
}

async function sendToDepartments(strapi, orderOrDocumentId) {
  const order = typeof orderOrDocumentId === 'string'
    ? await loadTakeaway(strapi, orderOrDocumentId)
    : orderOrDocumentId;
  if (!isTakeaway(order)) return null;
  if (order.status !== 'active') return order;
  if (order.sent_to_departments_at || ['sent_to_departments', 'ready', 'picked_up'].includes(order.takeaway_status)) {
    return order;
  }
  if (order.takeaway_status !== 'confirmed') return order;

  return strapi.documents('api::order.order').update({
    documentId: order.documentId,
    data: {
      takeaway_status: 'sent_to_departments',
      sent_to_departments_at: new Date().toISOString(),
    },
  });
}

async function loadTakeaway(strapi, documentId) {
  const rows = await strapi.documents('api::order.order').findMany({
    filters: {
      documentId: { $eq: documentId },
      service_type: { $eq: 'takeaway' },
    },
    populate: {
      fk_items: { populate: ['fk_element'] },
      fk_user: true,
    },
    limit: 1,
  });
  return rows && rows.length > 0 ? rows[0] : null;
}

async function refreshReadyState(strapi, orderOrDocumentId) {
  const order = typeof orderOrDocumentId === 'string'
    ? await loadTakeaway(strapi, orderOrDocumentId)
    : orderOrDocumentId;
  if (!isTakeaway(order)) return null;
  if (order.status !== 'active') return order;
  if (!['sent_to_departments', 'ready'].includes(order.takeaway_status)) return order;
  if (order.takeaway_status === 'ready') return order;

  const items = Array.isArray(order.fk_items) ? order.fk_items : [];
  if (items.length === 0) return order;
  const allReady = items.every((item) => item.status === 'ready' || item.status === 'served');
  if (!allReady) return order;

  return strapi.documents('api::order.order').update({
    documentId: order.documentId,
    data: {
      takeaway_status: 'ready',
      ready_at: new Date().toISOString(),
    },
  });
}

async function sweepDueTakeaways(strapi, { limit = 100 } = {}) {
  const threshold = new Date(Date.now() + TAKEAWAY_SEND_LEAD_MS).toISOString();
  const rows = await strapi.documents('api::order.order').findMany({
    filters: {
      service_type: { $eq: 'takeaway' },
      status: { $eq: 'active' },
      takeaway_status: { $eq: 'confirmed' },
      pickup_at: { $lte: threshold },
    },
    pagination: { page: 1, pageSize: limit },
    sort: ['pickup_at:asc'],
  });

  let sent = 0;
  for (const order of rows || []) {
    const updated = await sendToDepartments(strapi, order);
    if (updated && updated.sent_to_departments_at) sent += 1;
  }
  return sent;
}

module.exports = {
  TAKEAWAY_SEND_LEAD_MINUTES,
  TAKEAWAY_SEND_LEAD_MS,
  TAKEAWAY_STATUSES,
  isTakeaway,
  pickupDueForSend,
  loadTakeaway,
  sendToDepartments,
  refreshReadyState,
  sweepDueTakeaways,
};

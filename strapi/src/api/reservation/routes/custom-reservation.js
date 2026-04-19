'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/reservations',
      handler: 'reservation.createAuthenticated',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/reservations/walkin',
      handler: 'reservation.walkin',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/reservations/public/:userDocumentId',
      handler: 'reservation.createPublic',
      config: {
        auth: false,
        policies: [],
        middlewares: ['api::reservation.rate-limit-public'],
      },
    },
    {
      method: 'GET',
      path: '/reservations',
      handler: 'reservation.list',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/reservations/:documentId/status',
      handler: 'reservation.updateStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/reservations/:documentId/seat',
      handler: 'reservation.seat',
      config: { policies: [], middlewares: [] },
    },
  ],
};

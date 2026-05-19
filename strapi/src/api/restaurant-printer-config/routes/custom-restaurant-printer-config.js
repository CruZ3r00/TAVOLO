'use strict';

/**
 * Route custom per configurazione stampanti ristorante.
 * Core Content API disabilitata — gestita esclusivamente qui.
 */

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/restaurant-printer-config/me',
      handler: 'restaurant-printer-config.findMe',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/restaurant-printer-config/me',
      handler: 'restaurant-printer-config.upsertMe',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/restaurant-printer-config/test-print',
      handler: 'restaurant-printer-config.testPrint',
      config: { policies: [], middlewares: [] },
    },
  ],
};

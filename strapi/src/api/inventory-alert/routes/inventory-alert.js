'use strict';

module.exports = {
  routes: [
    { method: 'GET',  path: '/inventory/alerts',                   handler: 'inventory-alert.list' },
    { method: 'POST', path: '/inventory/alerts/:id/acknowledge',   handler: 'inventory-alert.acknowledge' },
  ],
};

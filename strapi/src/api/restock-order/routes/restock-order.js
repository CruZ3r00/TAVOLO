'use strict';

module.exports = {
  routes: [
    { method: 'POST',   path: '/restock-orders',                  handler: 'restock-order.create' },
    { method: 'GET',    path: '/restock-orders',                  handler: 'restock-order.list' },
    { method: 'GET',    path: '/restock-orders/:id',              handler: 'restock-order.findOne' },
    { method: 'POST',   path: '/restock-orders/:id/receive',      handler: 'restock-order.receive' },
    { method: 'POST',   path: '/restock-orders/:id/cancel',       handler: 'restock-order.cancel' },
  ],
};

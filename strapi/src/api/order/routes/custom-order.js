'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/orders',
      handler: 'order.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/orders',
      handler: 'order.list',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/orders/:documentId',
      handler: 'order.findOne',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/orders/:documentId/total',
      handler: 'order.getTotal',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/items',
      handler: 'order.addItem',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:documentId/items/:itemDocumentId',
      handler: 'order.updateItem',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/orders/:documentId/items/:itemDocumentId',
      handler: 'order.deleteItem',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:documentId/items/:itemDocumentId/status',
      handler: 'order.updateItemStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/close',
      handler: 'order.close',
      config: { policies: [], middlewares: [] },
    },
  ],
};

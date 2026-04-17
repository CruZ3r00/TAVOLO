'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/tables',
      handler: 'table.list',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tables',
      handler: 'table.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/tables/:documentId',
      handler: 'table.update',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/tables/:documentId',
      handler: 'table.remove',
      config: { policies: [], middlewares: [] },
    },
  ],
};

'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/menus/public/:userDocumentId',
      handler: 'menu.publicMenu',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/menus/import/analyze',
      handler: 'menu.analyzeImport',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/menus/import/bulk',
      handler: 'menu.bulkImport',
      config: { policies: [], middlewares: [] },
    },
  ],
};

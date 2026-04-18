'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/elements',
      handler: 'element.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/elements/:documentId',
      handler: 'element.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/elements/:documentId',
      handler: 'element.remove',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

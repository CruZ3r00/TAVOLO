'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/menus',
      handler: 'menu.list',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

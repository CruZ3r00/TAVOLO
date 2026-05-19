'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/order-archives/history',
      handler: 'order-archive.history',
      config: { policies: [] },
    },
  ],
};

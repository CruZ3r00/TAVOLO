'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/bar-shifts/current',
      handler: 'bar-shift.getCurrent',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/bar-shifts/current/report',
      handler: 'bar-shift.getCurrentReport',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/bar-shifts/open',
      handler: 'bar-shift.openShift',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/bar-shifts/carico-fatto',
      handler: 'bar-shift.caricoFatto',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/bar-shifts/history',
      handler: 'bar-shift.getHistory',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/bar-shifts/:id/close',
      handler: 'bar-shift.closeShift',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/bar-shifts/:id/report',
      handler: 'bar-shift.getReport',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/bar-shifts/:id',
      handler: 'bar-shift.findOne',
      config: { policies: [], middlewares: [] },
    },
  ],
};

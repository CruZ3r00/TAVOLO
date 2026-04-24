'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/billing/status',
      handler: 'billing.status',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/billing/checkout',
      handler: 'billing.createCheckoutSession',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/billing/portal',
      handler: 'billing.createPortalSession',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/billing/webhook',
      handler: 'billing.webhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

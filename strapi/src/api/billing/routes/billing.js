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
      path: '/billing/sync-checkout',
      handler: 'billing.syncCheckoutSession',
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
      path: '/billing/change-plan',
      handler: 'billing.changePlan',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/billing/cancel',
      handler: 'billing.cancelSubscription',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/billing/reactivate',
      handler: 'billing.reactivateSubscription',
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

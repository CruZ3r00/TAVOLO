'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/billing/status',
      handler: 'billing.status',
    },
    {
      method: 'POST',
      path: '/billing/checkout',
      handler: 'billing.createCheckoutSession',
    },
    {
      method: 'POST',
      path: '/billing/sync-checkout',
      handler: 'billing.syncCheckoutSession',
    },
    {
      method: 'POST',
      path: '/billing/portal',
      handler: 'billing.createPortalSession',
    },
    {
      method: 'POST',
      path: '/billing/change-plan',
      handler: 'billing.changePlan',
    },
    {
      method: 'POST',
      path: '/billing/cancel',
      handler: 'billing.cancelSubscription',
    },
    {
      method: 'POST',
      path: '/billing/reactivate',
      handler: 'billing.reactivateSubscription',
    },
    {
      method: 'POST',
      path: '/billing/webhook',
      handler: 'billing.webhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

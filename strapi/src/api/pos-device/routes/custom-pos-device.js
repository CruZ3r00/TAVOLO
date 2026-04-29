'use strict';

/**
 * Rotte pos-device. Nessuna CRUD di default esposta — solo custom endpoints.
 * Le rotte /me/* applicano il middleware device-token (auth via X-Device-Token);
 * le altre (register, revoke, listMine) usano l'auth JWT standard di Strapi.
 */

module.exports = {
  routes: [
    // Pairing / gestione (auth JWT utente)
    {
      method: 'POST',
      path: '/pos-devices/register',
      handler: 'pos-device.register',
      config: { policies: [], middlewares: [] },
    },
    // Pairing-token flow (più sicuro e semplice di register classico).
    {
      method: 'POST',
      path: '/pos-devices/me/pairing-token',
      handler: 'pos-device.createPairingToken',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/pos-devices/register-by-token',
      handler: 'pos-device.registerByToken',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/pos-devices/:documentId/revoke',
      handler: 'pos-device.revoke',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/pos-devices',
      handler: 'pos-device.listMine',
      config: { policies: [], middlewares: [] },
    },
    // Endpoint pubblico (auth utente) per i link di download installer/app.
    {
      method: 'GET',
      path: '/pos-devices/installers',
      handler: 'pos-device.installers',
      config: { auth: false, policies: [], middlewares: [] },
    },

    // Runtime (auth X-Device-Token)
    {
      method: 'GET',
      path: '/pos-devices/me/jobs',
      handler: 'pos-device.myJobs',
      config: {
        auth: false,
        policies: [],
        middlewares: ['global::device-token'],
      },
    },
    {
      method: 'POST',
      path: '/pos-devices/me/jobs/:event_id/ack',
      handler: 'pos-device.ackJob',
      config: {
        auth: false,
        policies: [],
        middlewares: ['global::device-token'],
      },
    },
    {
      method: 'POST',
      path: '/pos-devices/me/heartbeat',
      handler: 'pos-device.heartbeat',
      config: {
        auth: false,
        policies: [],
        middlewares: ['global::device-token'],
      },
    },
    {
      method: 'GET',
      path: '/pos-devices/me/config',
      handler: 'pos-device.myConfig',
      config: {
        auth: false,
        policies: [],
        middlewares: ['global::device-token'],
      },
    },
    {
      method: 'PATCH',
      path: '/pos-devices/me/push-token',
      handler: 'pos-device.updatePushToken',
      config: {
        auth: false,
        policies: [],
        middlewares: ['global::device-token'],
      },
    },
  ],
};

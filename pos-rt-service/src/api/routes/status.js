'use strict';

const express = require('express');
const deviceRepo = require('../../storage/repositories/deviceRepo');
const jobQueueRepo = require('../../storage/repositories/jobQueueRepo');
const auditRepo = require('../../storage/repositories/auditRepo');

function buildRouter({ wsClient, driverRegistry }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const device = deviceRepo.get();
    const queue = jobQueueRepo.stats();
    const audit = { count: auditRepo.count() };
    const drivers = driverRegistry ? await driverRegistry.status() : null;
    res.json({
      paired: !!device,
      device: device
        ? {
            strapi_url: device.strapi_url,
            ws_url: device.ws_url,
            name: device.name,
            registered_at: device.registered_at,
            last_sync_at: device.last_sync_at,
          }
        : null,
      ws: {
        connected: wsClient?.isConnected() || false,
        state: wsClient?.state || 'n/a',
      },
      queue,
      audit,
      drivers,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  return router;
}

module.exports = { buildRouter };

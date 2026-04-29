'use strict';

const path = require('path');
const express = require('express');
const { loopbackOnly } = require('./middleware/loopback-only');
const { rateLimit } = require('./middleware/rate-limit');
const healthRouter = require('./routes/health');
const { buildRouter: buildStatusRouter } = require('./routes/status');
const { buildRouter: buildPairRouter } = require('./routes/pair');
const { buildRouter: buildAdminRouter } = require('./routes/admin');
const { getLogger } = require('../utils/logger');

const log = getLogger('api');

function buildApp({ config, wsClient, driverRegistry, queueManager, onPaired }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(loopbackOnly);
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit(config.api.rateLimit));

  // Static UI
  app.use('/ui', express.static(path.join(__dirname, 'ui'), { index: false }));
  app.get('/', (req, res) => res.redirect('/ui/pair.html'));

  // Routes
  app.use('/health', healthRouter);
  app.use('/status', buildStatusRouter({ wsClient, driverRegistry }));
  app.use('/pair', buildPairRouter({ onPaired, config }));
  app.use('/admin', buildAdminRouter({ driverRegistry, queueManager }));

  // Error handler finale
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    log.error({ err, path: req.path }, 'Errore API');
    const status = err.httpStatus || 500;
    res.status(status).json({
      code: err.code || 'INTERNAL',
      message: err.message || 'Errore interno',
    });
  });

  return app;
}

module.exports = { buildApp };

'use strict';

const path = require('path');
const pino = require('pino');
const { getLogsDir, ensureDir } = require('./machine');

let rootLogger = null;

function buildLogger() {
  const level = process.env.LOG_LEVEL || 'info';
  const logsDir = getLogsDir();
  ensureDir(logsDir);

  const isDev = process.env.NODE_ENV === 'development';

  const transports = isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : {
        targets: [
          {
            target: 'pino-roll',
            level,
            options: {
              file: path.join(logsDir, 'app.log'),
              frequency: 'daily',
              size: '50m',
              limit: { count: 30 },
              mkdir: true,
            },
          },
          {
            target: 'pino/file',
            level: 'warn',
            options: { destination: 1 },
          },
        ],
      };

  return pino(
    {
      level,
      base: { service: 'pos-rt-service', version: process.env.npm_package_version || '1.0.0' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          '*.device_token',
          '*.deviceToken',
          '*.password',
          '*.authorization',
          '*.cookie',
          'req.headers.authorization',
          'req.headers["x-device-token"]',
          'req.headers["x-local-pin"]',
        ],
        censor: '[REDACTED]',
      },
    },
    pino.transport(transports),
  );
}

function getLogger(name) {
  if (!rootLogger) rootLogger = buildLogger();
  return name ? rootLogger.child({ module: name }) : rootLogger;
}

module.exports = { getLogger };

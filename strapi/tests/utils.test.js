'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTotal } = require('../src/utils/order-total');
const { capacityFor, isSummerSeason } = require('../src/utils/season');
const { validateProductionConfig } = require('../src/utils/production-checks');

function withEnv(overrides, fn) {
  const previous = { ...process.env };
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    process.env = previous;
  }
}

test('computeTotal rounds subtotal and total', () => {
  const result = computeTotal({
    items: [
      { price: '6.50', quantity: '2' },
      { price: 3.333, quantity: 3 },
    ],
  });

  assert.equal(result.subtotal, 23);
  assert.equal(result.tax, 0);
  assert.equal(result.discount, 0);
  assert.equal(result.total, 23);
});

test('season capacity uses configured summer months', () => {
  withEnv({ SUMMER_MONTHS: '6,7,8' }, () => {
    assert.equal(isSummerSeason('2026-07-01T12:00:00.000Z'), true);
    assert.equal(isSummerSeason('2026-01-01T12:00:00.000Z'), false);
    assert.equal(
      capacityFor({ coperti_invernali: 20, coperti_estivi: 50 }, '2026-07-01T12:00:00.000Z'),
      50
    );
    assert.equal(
      capacityFor({ coperti_invernali: 20, coperti_estivi: 50 }, '2026-01-01T12:00:00.000Z'),
      20
    );
  });
});

test('production config fails on placeholders', () => {
  withEnv({
    NODE_ENV: 'production',
    APP_KEYS: 'toBeModified1,toBeModified2',
    API_TOKEN_SALT: 'tobemodified',
    ADMIN_JWT_SECRET: 'tobemodified',
    TRANSFER_TOKEN_SALT: 'tobemodified',
    JWT_SECRET: 'tobemodified',
    CORS_ORIGIN: '*',
    DATABASE_CLIENT: 'mysql',
    DATABASE_PASSWORD: '',
  }, () => {
    assert.throws(
      () => validateProductionConfig({ log: { error() {} } }),
      /Production environment checks failed/
    );
  });
});

test('production config allows safe minimal settings', () => {
  withEnv({
    NODE_ENV: 'production',
    APP_KEYS: 'a,b,c,d',
    API_TOKEN_SALT: 'salt',
    ADMIN_JWT_SECRET: 'admin-secret',
    TRANSFER_TOKEN_SALT: 'transfer-salt',
    JWT_SECRET: 'jwt-secret',
    PUBLIC_URL: 'https://api.example.com',
    FRONTEND_URL: 'https://app.example.com',
    CORS_ORIGIN: 'https://app.example.com',
    DATABASE_CLIENT: 'mysql',
    DATABASE_PASSWORD: 'not-a-placeholder',
    DATABASE_SSL: 'true',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
    OCR_SERVICE_URL: '',
    STRIPE_SECRET_KEY: '',
    NEW_USER_NOTIFICATION_EMAIL: '',
    SEED_DEMO_DATA: 'false',
  }, () => {
    assert.doesNotThrow(() => validateProductionConfig({ log: { error() {} } }));
  });
});

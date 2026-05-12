'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTotal } = require('../src/utils/order-total');
const { capacityFor, isSummerSeason } = require('../src/utils/season');
const { validateProductionConfig } = require('../src/utils/production-checks');
const {
  STAFF_ROLES,
  isReservedStaffUsername,
  publicSiteSlug,
  resolveStaffContext,
  validatePublicUsername,
} = require('../src/utils/staff-access');
const {
  consumeRecoveryCode,
  encodeRecoveryCodes,
  generateEmailCode,
  hashEmailCode,
  signTwoFactorChallenge,
  verifyEmailCode,
  verifyTwoFactorChallenge,
} = require('../src/utils/two-factor-auth');
const publicTakeawayGuard = require('../src/api/order/middlewares/public-takeaway-guard');

const testStrapi = {
  config: {
    get(key) {
      if (key === 'plugin::users-permissions.jwtSecret') return 'test-jwt-secret';
      return undefined;
    },
  },
};

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
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    SMTP_DEFAULT_FROM: 'Tavolo <no-reply@example.com>',
    SMTP_DEFAULT_REPLY_TO: 'support@example.com',
    SEED_DEMO_DATA: 'false',
  }, () => {
    assert.doesNotThrow(() => validateProductionConfig({ log: { error() {} } }));
  });
});

test('production config requires usable SMTP settings', () => {
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
    DATABASE_CLIENT: 'postgres',
    DATABASE_PASSWORD: 'not-a-placeholder',
    DATABASE_SSL: 'true',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
    SMTP_HOST: '',
    SMTP_PORT: 'not-a-port',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_DEFAULT_FROM: 'not-an-email',
    SEED_DEMO_DATA: 'false',
  }, () => {
    assert.throws(
      () => validateProductionConfig({ log: { error() {} } }),
      /SMTP_HOST[\s\S]*SMTP_PORT[\s\S]*SMTP_DEFAULT_FROM/
    );
  });
});

test('staff-style usernames are reserved for system-managed staff accounts', () => {
  assert.equal(isReservedStaffUsername('Matti.cameriere'), true);
  assert.equal(isReservedStaffUsername('Matti.cucina_sg'), true);
  assert.equal(isReservedStaffUsername('Matti.pizzeria'), true);
  assert.deepEqual(validatePublicUsername('Matti'), { ok: true, value: 'Matti' });
  assert.equal(validatePublicUsername('Matti.bar').ok, false);
});

test('staff context never infers tenant access from username alone', async () => {
  const actor = {
    id: 2,
    documentId: 'actor-doc',
    username: 'Matti.cameriere',
    email: 'actor@example.com',
    staff_role: null,
    fk_owner: null,
  };
  const strapi = {
    db: {
      connection: null,
      query() {
        return { findOne: async () => actor };
      },
    },
  };

  const context = await resolveStaffContext(strapi, actor);
  assert.equal(context.role, STAFF_ROLES.OWNER);
  assert.equal(context.ownerId, actor.id);
  assert.equal(context.isStaff, false);
});

test('staff context accepts explicit owner relation', async () => {
  const owner = { id: 1, documentId: 'owner-doc', username: 'Matti', email: 'owner@example.com' };
  const actor = {
    id: 2,
    documentId: 'actor-doc',
    username: 'Matti.cameriere',
    email: 'actor@example.com',
    staff_role: STAFF_ROLES.CAMERIERE,
    fk_owner: owner,
  };
  const strapi = {
    db: {
      connection: null,
      query() {
        return { findOne: async () => actor };
      },
    },
  };

  const context = await resolveStaffContext(strapi, actor);
  assert.equal(context.role, STAFF_ROLES.CAMERIERE);
  assert.equal(context.ownerId, owner.id);
  assert.equal(context.isStaff, true);
});

test('public site slug is filesystem and route safe', () => {
  assert.equal(publicSiteSlug('mattia@example.com'), 'MattiaExampleCom');
  assert.equal(publicSiteSlug('../strapi/.env'), 'StrapiEnv');
  assert.equal(publicSiteSlug('123 Pizza'), 'Ristorante123Pizza');
});

test('two factor recovery codes are hashed and consumed once', () => {
  const stored = encodeRecoveryCodes(testStrapi, ['abcd-1234']);
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0], 'abcd-1234');

  const firstUse = consumeRecoveryCode(testStrapi, stored, 'ABCD-1234');
  assert.equal(firstUse.ok, true);
  assert.deepEqual(firstUse.nextCodes, []);

  const secondUse = consumeRecoveryCode(testStrapi, firstUse.nextCodes, 'ABCD-1234');
  assert.equal(secondUse.ok, false);
});

test('two factor challenge token verifies purpose and tampering', () => {
  const token = signTwoFactorChallenge(testStrapi, 42);
  assert.equal(verifyTwoFactorChallenge(testStrapi, token).id, 42);
  assert.equal(verifyTwoFactorChallenge(testStrapi, `${token}x`), null);
});

test('two factor email codes are six digits and hashed', () => {
  const code = generateEmailCode();
  assert.match(code, /^\d{6}$/);
  const hash = hashEmailCode(testStrapi, code);
  assert.notEqual(hash, code);
  assert.equal(verifyEmailCode(testStrapi, hash, code), true);
  assert.equal(verifyEmailCode(testStrapi, hash, '000000'), false);
});

test('public takeaway guard replays matching idempotent requests', async () => {
  const guard = publicTakeawayGuard({}, { strapi: { log: { warn() {} } } });
  const key = `test-${Date.now()}-idem`;
  let nextCalls = 0;
  const makeCtx = () => ({
    method: 'POST',
    path: '/api/takeaways/public/owner-doc',
    params: { userDocumentId: 'owner-doc' },
    request: {
      ip: '127.0.0.50',
      headers: { 'idempotency-key': key },
      body: { customer_name: 'Matti', items: [{ id: 1, quantity: 1 }] },
    },
    set(name, value) {
      this.headers = { ...(this.headers || {}), [name]: value };
    },
  });

  const first = makeCtx();
  await guard(first, async () => {
    nextCalls += 1;
    first.status = 201;
    first.body = { data: { documentId: 'order-doc' } };
  });
  assert.equal(first.status, 201);

  const second = makeCtx();
  await guard(second, async () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
  assert.equal(second.status, 201);
  assert.equal(second.headers['Idempotency-Replayed'], 'true');
  assert.deepEqual(second.body, first.body);
});

test('public takeaway guard rate limits repeated non-idempotent requests', async () => {
  const guard = publicTakeawayGuard({}, { strapi: { log: { warn() {} } } });
  const previousMax = process.env.TAKEAWAY_RATE_LIMIT_MAX;
  const previousWindow = process.env.TAKEAWAY_RATE_LIMIT_WINDOW_MS;
  process.env.TAKEAWAY_RATE_LIMIT_MAX = '1';
  process.env.TAKEAWAY_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    const makeCtx = (suffix) => ({
      method: 'POST',
      path: '/api/takeaways/public/owner-doc',
      params: { userDocumentId: `owner-rate-${Date.now()}` },
      request: {
        ip: `127.0.1.${suffix}`,
        headers: {},
        body: { customer_name: 'Matti', items: [{ id: suffix, quantity: 1 }] },
      },
      set(name, value) {
        this.headers = { ...(this.headers || {}), [name]: value };
      },
    });

    const first = makeCtx(1);
    const targetId = first.params.userDocumentId;
    await guard(first, async () => {
      first.status = 201;
      first.body = { data: { ok: true } };
    });
    assert.equal(first.status, 201);

    const second = makeCtx(1);
    second.params.userDocumentId = targetId;
    await guard(second, async () => {
      second.status = 201;
    });
    assert.equal(second.status, 429);
    assert.equal(second.body.error.code, 'RATE_LIMITED');
  } finally {
    if (previousMax === undefined) delete process.env.TAKEAWAY_RATE_LIMIT_MAX;
    else process.env.TAKEAWAY_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.TAKEAWAY_RATE_LIMIT_WINDOW_MS;
    else process.env.TAKEAWAY_RATE_LIMIT_WINDOW_MS = previousWindow;
  }
});

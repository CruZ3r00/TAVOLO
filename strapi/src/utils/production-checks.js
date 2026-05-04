'use strict';

const PLACEHOLDER_VALUES = new Set([
  '',
  'tobemodified',
  'toBeModified',
  'to-be-modified1',
  'toBeModified1',
  'toBeModified2',
  'toBeModified3',
  'toBeModified4',
  'toBeModified5',
  'toBeModified6',
  'toBeModified7',
  'toBeModified8',
  'toBeModified9',
]);

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function isPlaceholder(value) {
  return PLACEHOLDER_VALUES.has(String(value || '').trim());
}

function requireEnv(name, errors) {
  const value = envValue(name);
  if (!value || isPlaceholder(value)) {
    errors.push(`Environment variable '${name}' is not set or has a placeholder value.`);
  }
  return value;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLocalOrigin(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(value);
}

function validateProductionConfig(strapi) {
    if(process.env.NODE_ENV !== 'production') return;

    const errors = [];

    ['APP_KEYS', 'API_TOKEN_SALT', 'ADMIN_JWT_SECRET', 'TRANSFER_TOKEN_SALT', 'JWT_SECRET'].forEach((name) => requireEnv(name, errors));

    const publicUrl = requireEnv('PUBLIC_URL', errors);
    const frontendUrl = requireEnv('FRONTEND_URL', errors);
    if (publicUrl && !isHttpsUrl(publicUrl)) {
        errors.push("Environment variable 'PUBLIC_URL' must be an https URL in production.");
    }
    if (frontendUrl && !isHttpsUrl(frontendUrl)) {
        errors.push("Environment variable 'FRONTEND_URL' must be an https URL in production.");
    }

    const cors = envValue('CORS_ORIGIN') || envValue('CORS_ORIGINS');
    if (!cors || cors === '*') {
        errors.push("Environment variable 'CORS_ORIGIN' or 'CORS_ORIGINS' is not set or allows all origins ('*').");   
    }
    const allowedAppOrigins = new Set([
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        'https://localhost',
    ]);

    for (const origin of parseCsv(cors)) {
        if (allowedAppOrigins.has(origin)) {
            continue;
        }
        if (!isHttpsUrl(origin)) {
            errors.push(`CORS origin '${origin}' must be https in production.`);
        }
        if (isLocalOrigin(origin)) {
            errors.push(`CORS origin '${origin}' is local/LAN and is not allowed in production.`);
        }
    }

    if (process.env.SEED_DEMO_DATA === 'true') {
        errors.push("Environment variable 'SEED_DEMO_DATA' should not be set to 'true' in production.");
    }

    if(envValue('OCR_SERVICE_URL')) {
        if (process.env.OCR_SERVICE_INTERNAL_TOKEN_REQUIRED !== 'true') {
            errors.push("Environment variable 'OCR_SERVICE_INTERNAL_TOKEN_REQUIRED' must be 'true' in production when OCR_SERVICE_URL is set.");
        }
        requireEnv('OCR_SERVICE_INTERNAL_TOKEN', errors);
    }

    const dbClient = envValue('DATABASE_CLIENT');
    if (dbClient === 'sqlite' || dbClient === 'sqlite3' || dbClient === 'better-sqlite3') {
        errors.push("Using 'sqlite' as DATABASE_CLIENT is not recommended for production environments.");
    }else if (dbClient){
        requireEnv('DATABASE_PASSWORD', errors);
        if (process.env.DATABASE_SSL !== 'true') {
            errors.push("Environment variable 'DATABASE_SSL' must be 'true' in production.");
        }
        if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
            errors.push("Environment variable 'DATABASE_SSL_REJECT_UNAUTHORIZED' must not be 'false' in production.");
        }
    }

    const stripeKey = envValue('STRIPE_SECRET_KEY');
    if (stripeKey) {
        if (!stripeKey.startsWith('sk_live_')) {
            errors.push("Environment variable 'STRIPE_SECRET_KEY' must be a live key ('sk_live_...') in production.");
        }
        requireEnv('STRIPE_WEBHOOK_SECRET', errors);
        const starter = requireEnv('STRIPE_PRICE_STARTER', errors);
        const pro = requireEnv('STRIPE_PRICE_PRO', errors);
        if (starter && pro && starter === pro) {
            errors.push("'STRIPE_PRICE_STARTER' and 'STRIPE_PRICE_PRO' must be different price ids in production.");
        }
    }

    if (errors.length > 0) {
    const message = `Production environment checks failed:\n- ${errors.join('\n- ')}`;
    strapi.log.error(message);
    throw new Error(message);
  }
}
module.exports = { validateProductionConfig };

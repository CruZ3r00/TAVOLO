'use strict';

const PLACEHOLDER_VALUES = new Set(['', 'toBeModified', 'to-be-modified1', 'toBeModified2', 'toBeModified3', 'toBeModified4', 'toBeModified5', 'toBeModified6', 'toBeModified7', 'toBeModified8', 'toBeModified9']);

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

function validateProductionConfig(strapi) {
    if(process.env.NODE_ENV !== 'production') return;

    const errors = [];

    ['APP_KEYS', 'API_TOKEN_SALT', 'ADMIN_JWT_SECRET', 'TRANSFER_TOKEN_SALT', 'JWT_SECRET'].forEach((name) => requireEnv(name, errors));
    const cors = envValue('CORS_ORIGIN') || envValue('CORS_ORIGINS');
    if (!cors || cors === '*') {
        errors.push("Environment variable 'CORS_ORIGIN' or 'CORS_ORIGINS' is not set or allows all origins ('*').");   
    }
    if (process.env.SEED_DEMO_DATA === 'true') {
        errors.push("Environment variable 'SEED_DEMO_DATA' should not be set to 'true' in production.");
    }

    if(envValue('OCR_SERVICE_URL') && process.env.OCR_SERVICE_INTERNAL_TOKEN_REQUIRED !== 'false') {
        requireEnv('OCR_SERVICE_INTERNAL_TOKEN', errors);
    }

    const dbClient = envValue('DATABASE_CLIENT');
    if (dbClient === 'sqlite' || dbClient === 'sqlite3' || dbClient === 'better-sqlite3') {
        errors.push("Using 'sqlite' as DATABASE_CLIENT is not recommended for production environments.");
    }else if (dbClient){
        requireEnv('DATABASE_PASSWORD', errors);
    }

    if (errors.length > 0) {
    const message = `Production environment checks failed:\n- ${errors.join('\n- ')}`;
    strapi.log.error(message);
    throw new Error(message);
  }
}
module.exports = { validateProductionConfig };
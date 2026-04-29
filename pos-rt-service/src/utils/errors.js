'use strict';

/**
 * AppError — errore applicativo con codice semantico e http status mapping.
 * Codici stabili: sono visibili nelle API locali e nei log di audit.
 */
class AppError extends Error {
  constructor(code, message, { httpStatus = 500, details = null, cause = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

const CODES = {
  NOT_PAIRED: 'NOT_PAIRED',
  ALREADY_PAIRED: 'ALREADY_PAIRED',
  PAIRING_FAILED: 'PAIRING_FAILED',
  PAIRING_CLAIM_REQUIRED: 'PAIRING_CLAIM_REQUIRED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  STRAPI_UNAVAILABLE: 'STRAPI_UNAVAILABLE',
  STRAPI_AUTH_FAILED: 'STRAPI_AUTH_FAILED',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  DB_CORRUPT: 'DB_CORRUPT',
  CRYPTO_FAILED: 'CRYPTO_FAILED',
  QUEUE_FULL: 'QUEUE_FULL',
  DRIVER_UNAVAILABLE: 'DRIVER_UNAVAILABLE',
  DRIVER_TIMEOUT: 'DRIVER_TIMEOUT',
  DRIVER_ERROR: 'DRIVER_ERROR',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  LOOPBACK_ONLY: 'LOOPBACK_ONLY',
  LOCAL_AUTH_FAILED: 'LOCAL_AUTH_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  AUDIT_CORRUPT: 'AUDIT_CORRUPT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL',
};

module.exports = { AppError, CODES };

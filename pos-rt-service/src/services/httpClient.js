'use strict';

const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const tls = require('tls');
const { getLogger } = require('../utils/logger');
const { AppError, CODES } = require('../utils/errors');
const { sleep } = require('../utils/backoff');

const log = getLogger('services/httpClient');

/**
 * HTTP client verso Strapi con:
 *  - device token automatico (X-Device-Token)
 *  - retry su 5xx/ECONNRESET/timeout (max 3, exp backoff)
 *  - timeout configurabile
 *  - cert pinning opzionale
 *  - HTTPS enforcement (salvo ALLOW_INSECURE)
 */
class HttpClient {
  constructor({ baseURL, deviceToken, timeoutMs = 15_000, allowInsecure = false, trustedCertFingerprints = [], userAgent = 'pos-rt-service/1.0' }) {
    if (!baseURL) throw new AppError(CODES.INVALID_PAYLOAD, 'baseURL mancante');
    if (!allowInsecure && !/^https:\/\//i.test(baseURL)) {
      throw new AppError(
        CODES.INVALID_PAYLOAD,
        `Solo HTTPS è consentito verso Strapi (ricevuto: ${baseURL}). Set ALLOW_INSECURE=true per dev locale.`,
      );
    }

    this.baseURL = baseURL.replace(/\/+$/, '');
    this.deviceToken = deviceToken;
    this.timeoutMs = timeoutMs;
    this.trustedCertFingerprints = trustedCertFingerprints || [];

    const httpsAgent = this.trustedCertFingerprints.length
      ? new https.Agent({
          checkServerIdentity: (host, cert) => {
            // Step 1: hostname check di default (Subject Alt Name / CN).
            // Il pinning è additivo, NON sostituisce il check hostname.
            const stdErr = tls.checkServerIdentity(host, cert);
            if (stdErr) return stdErr;
            // Step 2: pinning fingerprint SHA-256 sul cert presentato.
            const fp = crypto
              .createHash('sha256')
              .update(cert.raw)
              .digest('hex')
              .toUpperCase();
            const normalized = this.trustedCertFingerprints.map((s) => s.toUpperCase().replace(/:/g, ''));
            if (!normalized.includes(fp)) {
              return new Error(
                `Cert pinning fallito: fingerprint ${fp} non nella whitelist (host=${host})`,
              );
            }
            return undefined;
          },
        })
      : undefined;

    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeoutMs,
      httpsAgent,
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      validateStatus: () => true,
    });
  }

  setDeviceToken(token) {
    this.deviceToken = token;
  }

  buildHeaders(extra = {}) {
    const headers = { ...extra };
    if (this.deviceToken) headers['X-Device-Token'] = this.deviceToken;
    return headers;
  }

  async request(method, pathOrUrl, { data, params, headers, retries = 3 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.axios.request({
          method,
          url: pathOrUrl,
          data,
          params,
          headers: this.buildHeaders(headers),
        });

        if (res.status === 401 || res.status === 403) {
          throw new AppError(
            CODES.DEVICE_REVOKED,
            `Autenticazione rifiutata (${res.status}): device revocato o token invalido`,
            { httpStatus: res.status, details: res.data },
          );
        }
        if (res.status >= 500 || res.status === 429) {
          lastErr = new AppError(
            CODES.STRAPI_UNAVAILABLE,
            `Strapi ha risposto ${res.status}`,
            { httpStatus: res.status, details: res.data },
          );
          if (attempt < retries) {
            const delay = 500 * Math.pow(2, attempt) + Math.random() * 300;
            log.warn({ status: res.status, attempt, delay }, 'Retry HTTP');
            await sleep(delay);
            continue;
          }
          throw lastErr;
        }
        if (res.status >= 400) {
          throw new AppError(
            CODES.INVALID_PAYLOAD,
            `Strapi ha rifiutato la richiesta (${res.status})`,
            { httpStatus: res.status, details: res.data },
          );
        }
        return res.data;
      } catch (err) {
        // Errori di rete/timeout: retry
        if (err instanceof AppError) throw err;
        const retriable =
          err.code === 'ECONNRESET' ||
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ECONNREFUSED' ||
          err.code === 'EAI_AGAIN' ||
          err.message === 'Network Error';
        lastErr = new AppError(CODES.STRAPI_UNAVAILABLE, `Errore rete: ${err.message}`, {
          cause: err,
        });
        if (retriable && attempt < retries) {
          const delay = 500 * Math.pow(2, attempt) + Math.random() * 300;
          log.warn({ err: err.message, attempt, delay }, 'Retry HTTP network');
          await sleep(delay);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr || new AppError(CODES.STRAPI_UNAVAILABLE, 'Richiesta fallita');
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }
  post(path, data, opts = {}) {
    return this.request('POST', path, { ...opts, data });
  }
  patch(path, data, opts = {}) {
    return this.request('PATCH', path, { ...opts, data });
  }
  del(path, opts) {
    return this.request('DELETE', path, opts);
  }
}

module.exports = { HttpClient };

/**
 * HTTP client outbound verso Strapi.
 * Mobile equivalent di pos-rt-service/src/services/httpClient.js — port
 * isolato (niente import dal Node), usa fetch nativo.
 *
 * Vincoli:
 *  - Tutto outbound: il device parla a Strapi, mai il contrario.
 *  - HTTPS enforced in produzione (allowInsecure solo in dev).
 *  - Retry con exp backoff su 5xx/429/network errors.
 */

import { devicePersistence } from './persistence';

export class HttpError extends Error {
  code: string;
  status?: number;
  details?: unknown;
  constructor(code: string, message: string, opts?: { status?: number; details?: unknown }) {
    super(message);
    this.code = code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

export interface RequestOpts {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  authed?: boolean; // true (default) = include device token
  signal?: AbortSignal;
}

export class HttpClient {
  baseURL: string;
  defaultTimeoutMs: number;
  allowInsecure: boolean;

  constructor(opts: { baseURL: string; timeoutMs?: number; allowInsecure?: boolean }) {
    this.baseURL = opts.baseURL.replace(/\/+$/, '');
    this.defaultTimeoutMs = opts.timeoutMs ?? 15_000;
    this.allowInsecure = !!opts.allowInsecure;
    if (!this.allowInsecure && !/^https:\/\//i.test(this.baseURL)) {
      throw new HttpError(
        'INVALID_URL',
        `Solo HTTPS supportato verso Strapi (got: ${this.baseURL}). Disabilitabile in dev.`,
      );
    }
  }

  setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/+$/, '');
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const retries = opts.retries ?? 3;
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    let url = this.baseURL + (path.startsWith('/') ? path : '/' + path);
    if (opts.query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) q.set(k, String(v));
      }
      const s = q.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(opts.headers || {}),
    };

    if (opts.authed !== false) {
      const token = await devicePersistence.getToken();
      if (token) headers['X-Device-Token'] = token;
    }

    const init: RequestInit = { method, headers };
    if (opts.body !== undefined && opts.body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    let lastErr: HttpError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const tmo = setTimeout(() => ctrl.abort(), timeoutMs);
      const onAbortExt = () => ctrl.abort();
      opts.signal?.addEventListener('abort', onAbortExt);
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: ctrl.signal });
      } catch (err: any) {
        clearTimeout(tmo);
        opts.signal?.removeEventListener('abort', onAbortExt);
        const aborted = err.name === 'AbortError';
        const code = aborted ? 'TIMEOUT' : 'NETWORK_ERROR';
        lastErr = new HttpError(code, aborted ? `Timeout dopo ${timeoutMs}ms` : err.message);
        if (attempt < retries) {
          await sleep(retryDelay(attempt));
          continue;
        }
        throw lastErr;
      }
      clearTimeout(tmo);
      opts.signal?.removeEventListener('abort', onAbortExt);

      if (res.status === 401 || res.status === 403) {
        throw new HttpError('DEVICE_REVOKED', `Auth rifiutata (${res.status})`, { status: res.status });
      }
      if (res.status >= 500 || res.status === 429) {
        const body = await safeText(res);
        lastErr = new HttpError('STRAPI_UNAVAILABLE', `Strapi ha risposto ${res.status}`, {
          status: res.status,
          details: body.slice(0, 500),
        });
        if (attempt < retries) {
          await sleep(retryDelay(attempt));
          continue;
        }
        throw lastErr;
      }
      if (res.status >= 400) {
        const body = await safeText(res);
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_) { /* ignore */ }
        throw new HttpError('REQUEST_FAILED', parsed?.error?.message || body || `HTTP ${res.status}`, {
          status: res.status,
          details: parsed || body,
        });
      }
      // 2xx OK
      const text = await safeText(res);
      if (!text) return null as unknown as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
    throw lastErr ?? new HttpError('UNKNOWN', 'Richiesta fallita');
  }

  get<T = unknown>(path: string, opts?: Omit<RequestOpts, 'body'>) {
    return this.request<T>('GET', path, opts);
  }
  post<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOpts, 'body'>) {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOpts, 'body'>) {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  del<T = unknown>(path: string, opts?: Omit<RequestOpts, 'body'>) {
    return this.request<T>('DELETE', path, opts);
  }
}

function retryDelay(attempt: number): number {
  return 500 * Math.pow(2, attempt) + Math.random() * 300;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

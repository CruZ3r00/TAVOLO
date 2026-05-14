import { API_BASE } from './_base';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'ct_csrf';

function cookieValue(name) {
  const encoded = `${encodeURIComponent(name)}=`;
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const value = part.trim();
    if (value.startsWith(encoded)) {
      return decodeURIComponent(value.slice(encoded.length));
    }
  }
  return '';
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function isApiRequest(input) {
  const url = requestUrl(input);
  if (!url) return false;
  if (API_BASE) return url === API_BASE || url.startsWith(`${API_BASE}/`);
  return url.startsWith('/api/');
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function headersWithCsrf(input, init) {
  const headers = new Headers(init?.headers || input?.headers || undefined);
  if (!headers.has('X-CSRF-Token')) {
    const csrf = cookieValue(CSRF_COOKIE_NAME);
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return headers;
}

export function installCredentialedFetch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__tavoloCredentialedFetchInstalled) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    if (!isApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const nextInit = {
      ...init,
      credentials: init.credentials || 'include',
    };

    if (UNSAFE_METHODS.has(requestMethod(input, init))) {
      nextInit.headers = headersWithCsrf(input, init);
    }

    return nativeFetch(input, nextInit);
  };
  window.__tavoloCredentialedFetchInstalled = true;
}

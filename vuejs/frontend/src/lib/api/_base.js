// Base helpers per le chiamate alle API Strapi.
// Questi moduli sono framework-agnostic (no Vue): condivisi tra modern (Vue 3)
// e legacy (Vue 2.7) build, e tra composable Vue 3 e methods Vue 2.

export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

/**
 * Costruisce un Error arricchito con `status`, `code`, `details` a partire
 * dalla risposta di errore standard Strapi `{ error: { code, message, details } }`.
 */
export const buildApiError = (resp, payload) => {
  const errBody = payload?.error || {};
  const err = new Error(errBody.message || payload?.message || `Richiesta fallita (HTTP ${resp.status})`);
  err.status = resp.status;
  err.code = errBody.code || null;
  err.details = errBody.details || null;
  return err;
};

/**
 * Headers JSON standard con Bearer token opzionale.
 */
export const jsonHeaders = (token) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

/**
 * Headers minimi (no Content-Type) per chiamate senza body.
 */
export const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

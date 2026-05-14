// API client per il turno bar (vedi backend `src/services/bar-shift/` + `src/api/bar-shift/`).
// Framework-agnostic: importabile sia da modern (Vue 3) sia da legacy (Vue 2.7).

import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

const BASE = `${API_BASE}/api/bar-shifts`;

/**
 * Ritorna il turno aperto per l'owner, oppure `null`.
 * 200 OK { data: { id, opened_at, ... } | null }
 */
export const fetchBarShiftCurrent = async (token) => {
  const resp = await fetch(`${BASE}/current`, { method: 'GET', headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data || null;
};

/**
 * Report real-time del turno aperto.
 * 409 BAR_SHIFT_NOT_OPEN se nessun turno aperto.
 */
export const fetchBarShiftCurrentReport = async (token) => {
  const resp = await fetch(`${BASE}/current/report`, { method: 'GET', headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Apre un nuovo turno. 409 BAR_SHIFT_ALREADY_OPEN se c'e' gia un turno aperto.
 */
export const openBarShift = async (token, body = {}) => {
  const resp = await fetch(`${BASE}/open`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Chiude il turno indicato. Idempotente: chiudere uno gia chiuso ritorna
 * il turno con lo snapshot esistente.
 */
export const closeBarShift = async (token, idOrDocId, body = {}) => {
  const resp = await fetch(`${BASE}/${encodeURIComponent(idOrDocId)}/close`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Atomic close-current + open-new. Ritorna { closed, opened, report }.
 */
export const caricoFatto = async (token, body = {}) => {
  const resp = await fetch(`${BASE}/carico-fatto`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Lista paginata dello storico turni chiusi.
 * filters: { from?, to?, page?, pageSize? }
 */
export const fetchBarShiftHistory = async (token, filters = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  }
  const q = params.toString() ? `?${params.toString()}` : '';
  const resp = await fetch(`${BASE}/history${q}`, { method: 'GET', headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

export const fetchBarShiftById = async (token, idOrDocId) => {
  const resp = await fetch(`${BASE}/${encodeURIComponent(idOrDocId)}`, { method: 'GET', headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const fetchBarShiftReport = async (token, idOrDocId) => {
  const resp = await fetch(`${BASE}/${encodeURIComponent(idOrDocId)}/report`, { method: 'GET', headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Traduce un errore API bar-shift in messaggio user-friendly italiano.
 */
export const barShiftErrorMessage = (err) => {
  if (!err) return 'Errore sconosciuto.';
  const code = err.code || null;
  const status = err.status || null;
  if (code === 'BAR_SHIFT_NOT_OPEN') return 'Nessun turno aperto. Apri un turno per registrare le vendite del bar.';
  if (code === 'BAR_SHIFT_ALREADY_OPEN') return 'Hai gia un turno aperto. Chiudilo prima di aprirne uno nuovo.';
  if (code === 'BAR_SHIFT_NOT_FOUND') return 'Turno non trovato.';
  if (status === 403) return 'Non hai accesso a questa funzione del bar.';
  if (status === 401) return 'Sessione scaduta. Effettua di nuovo l\'accesso.';
  return err.message || 'Errore durante l\'operazione.';
};

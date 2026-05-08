import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

/**
 * Lista tavoli del ristorante corrente.
 */
export const fetchTables = async (token) => {
  const resp = await fetch(`${API_BASE}/api/tables`, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Crea un nuovo tavolo. body: { number, seats, area? }
 */
export const createTable = async (body, token) => {
  const resp = await fetch(`${API_BASE}/api/tables`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Aggiorna un tavolo. body: { number?, seats?, area? }
 */
export const updateTable = async (documentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/tables/${documentId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Elimina un tavolo.
 */
export const deleteTable = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/tables/${documentId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (resp.status === 204) return true;
  const payload = await resp.json().catch(() => ({}));
  throw buildApiError(resp, payload);
};

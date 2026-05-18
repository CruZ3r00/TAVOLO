import { API_BASE, buildApiError, jsonHeaders } from './_base.js';

/**
 * Lista addon disponibili per la presa ordine (cameriere).
 * GET /api/ingredients/addons
 */
export const fetchAddons = async (token) => {
  const resp = await fetch(`${API_BASE}/api/ingredients/addons`, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data || [];
};

/**
 * Configura un ingrediente come addon.
 * PUT /api/ingredients/:documentId/addon
 */
export const setIngredientAddonConfig = async (documentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/ingredients/${documentId}/addon`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

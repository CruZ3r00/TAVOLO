// API client per il modulo Gestione Magazzino (FASE 4, solo Owner+Pro).
// Framework-agnostic: condiviso modern + legacy.

import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

const BASE = `${API_BASE}/api`;

/* ============================================================ */
/* Ingredients advanced                                         */
/* ============================================================ */

export const fetchIngredientsAdvanced = async (token) => {
  const resp = await fetch(`${BASE}/ingredients/advanced`, { headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return Array.isArray(payload.data) ? payload.data : [];
};

export const createIngredient = async (token, data) => {
  const resp = await fetch(`${BASE}/ingredients`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ data }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const updateIngredient = async (token, idOrDoc, patch) => {
  const resp = await fetch(`${BASE}/ingredients/${encodeURIComponent(idOrDoc)}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ data: patch }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const deleteIngredient = async (token, idOrDoc) => {
  const resp = await fetch(`${BASE}/ingredients/${encodeURIComponent(idOrDoc)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!resp.ok && resp.status !== 204) {
    const payload = await resp.json().catch(() => ({}));
    throw buildApiError(resp, payload);
  }
  return true;
};

export const restockIngredient = async (token, idOrDoc, body) => {
  const resp = await fetch(`${BASE}/ingredients/${encodeURIComponent(idOrDoc)}/restock`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Rifornimento multi-ingrediente: applica carico in lotto a piu' ingredienti
 * con un singolo costo totale (distribuito proporzionalmente alla quantita).
 *
 * @param {string} token
 * @param {Array<{ ingredient_id, qty }>} items
 * @param {number|null} totalCost
 * @param {string|null} note
 */
export const restockBatch = async (token, items, totalCost = null, note = null) => {
  const body = { data: { items } };
  if (totalCost !== null && totalCost !== undefined && Number.isFinite(Number(totalCost))) {
    body.data.total_cost = Number(totalCost);
  }
  if (note && String(note).trim()) body.data.note = String(note).trim();
  const resp = await fetch(`${BASE}/ingredients/restock-batch`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const wasteIngredient = async (token, idOrDoc, body) => {
  const resp = await fetch(`${BASE}/ingredients/${encodeURIComponent(idOrDoc)}/waste`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const confirmDepletedIngredient = async (token, idOrDoc, body) => {
  const resp = await fetch(`${BASE}/ingredients/${encodeURIComponent(idOrDoc)}/confirm-depleted`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const fetchIngredientMovements = async (token, idOrDoc, params = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const url = `${BASE}/ingredients/${encodeURIComponent(idOrDoc)}/movements${qs.toString() ? '?' + qs.toString() : ''}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return Array.isArray(payload.data) ? payload.data : [];
};

/* ============================================================ */
/* Restock orders                                               */
/* ============================================================ */

export const createRestockOrders = async (token, items, note) => {
  const resp = await fetch(`${BASE}/restock-orders`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ data: { items, note: note || null } }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const fetchRestockOrders = async (token, params = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const url = `${BASE}/restock-orders${qs.toString() ? '?' + qs.toString() : ''}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

export const receiveRestock = async (token, idOrDoc, body) => {
  const resp = await fetch(`${BASE}/restock-orders/${encodeURIComponent(idOrDoc)}/receive`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const cancelRestock = async (token, idOrDoc) => {
  const resp = await fetch(`${BASE}/restock-orders/${encodeURIComponent(idOrDoc)}/cancel`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/* ============================================================ */
/* Inventory alerts                                             */
/* ============================================================ */

export const fetchInventoryAlerts = async (token, params = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const url = `${BASE}/inventory/alerts${qs.toString() ? '?' + qs.toString() : ''}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

export const acknowledgeAlert = async (token, idOrDoc) => {
  const resp = await fetch(`${BASE}/inventory/alerts/${encodeURIComponent(idOrDoc)}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/* ============================================================ */
/* Element recipe (qty_per_serving)                             */
/* ============================================================ */

export const fetchElementRecipe = async (token, documentId) => {
  const resp = await fetch(`${BASE}/elements/${encodeURIComponent(documentId)}/recipe`, {
    headers: authHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return (payload.data && payload.data.recipe) || [];
};

export const setElementRecipe = async (token, documentId, recipe) => {
  const resp = await fetch(`${BASE}/elements/${encodeURIComponent(documentId)}/recipe`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ data: { recipe } }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return (payload.data && payload.data.recipe) || [];
};

/* ============================================================ */
/* Error message helper                                         */
/* ============================================================ */

export const inventoryErrorMessage = (err) => {
  if (!err) return 'Errore sconosciuto.';
  const code = err.code || null;
  const status = err.status || null;
  if (code === 'INGREDIENT_NOT_FOUND') return 'Ingrediente non trovato.';
  if (code === 'RESTOCK_NOT_FOUND') return 'Ordine di rifornimento non trovato.';
  if (code === 'RESTOCK_ALREADY_RECEIVED') return 'Questo ordine e\' gia stato ricevuto.';
  if (code === 'RESTOCK_ALREADY_CANCELLED') return 'Questo ordine e\' gia stato annullato.';
  if (code === 'INVALID_PAYLOAD') return err.message || 'Dati non validi.';
  if (status === 403) return 'Non hai accesso a questa funzione del magazzino.';
  if (status === 401) return 'Sessione scaduta.';
  return err.message || 'Errore durante l\'operazione.';
};

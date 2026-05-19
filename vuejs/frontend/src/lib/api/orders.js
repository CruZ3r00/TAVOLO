import qs from 'qs';
import { API_BASE, buildApiError, jsonHeaders } from './_base.js';

/**
 * Lista paginata degli ordini del ristoratore corrente.
 * params: { status?, table?, from?, to?, page?, pageSize?, service_type? }
 */
export const fetchOrders = async (params = {}, token) => {
  const query = qs.stringify(params, { skipNulls: true });
  const url = query
    ? `${API_BASE}/api/orders?${query}`
    : `${API_BASE}/api/orders`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Lista leggera per board operative (owner/reparti).
 */
export const fetchOrdersBoard = async (params = {}, token) => {
  const query = qs.stringify(params, { skipNulls: true });
  const url = query
    ? `${API_BASE}/api/orders/board?${query}`
    : `${API_BASE}/api/orders/board`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Stato leggero per griglia sala/cameriere.
 */
export const fetchOrdersSala = async (params = {}, token) => {
  const query = qs.stringify(params, { skipNulls: true });
  const url = query
    ? `${API_BASE}/api/orders/sala?${query}`
    : `${API_BASE}/api/orders/sala`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Apre un ordine su un tavolo. body: { table_id (documentId), covers? }
 */
export const openOrder = async (body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Dettaglio ordine con items.
 */
export const fetchOrder = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${documentId}`, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Aggiunge item all'ordine.
 * body: { element_id?, name?, price?, quantity, category?, course?, notes?, lock_version? }
 */
export const addOrderItem = async (orderDocumentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Aggiorna quantity/notes di un item.
 * body: { quantity?, notes?, lock_version? }
 */
export const updateOrderItem = async (orderDocumentId, itemDocumentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Elimina un item dall'ordine.
 */
export const deleteOrderItem = async (orderDocumentId, itemDocumentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Transizione stato item (FSM). body: { status }
 */
export const updateItemStatus = async (orderDocumentId, itemDocumentId, status, token, params = {}) => {
  const query = qs.stringify(params, { skipNulls: true });
  const url = query
    ? `${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}/status?${query}`
    : `${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}/status`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ status }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Annulla un item gia in lavorazione/servito. Marca voided=true e ricalcola.
 * body: { reason, lock_version? }
 */
export const voidOrderItem = async (orderDocumentId, itemDocumentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}/void`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Invia un ordine dine-in (tavolo) in produzione: avanza tutti gli items
 * con status='taken' a 'preparing'. Idempotente.
 * Resp: { data: order, meta: { sent } }
 */
export const sendOrderToProduction = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${documentId}/send`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Chiude ordine + pagamento. body: { payment_method?, lock_version? }
 */
export const closeOrder = async (documentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/orders/${documentId}/close`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Traduce un errore ordine in messaggio italiano.
 */
export const orderErrorMessage = (err) => {
  if (!err) return 'Errore sconosciuto.';
  const code = err.code;
  switch (code) {
    case 'TABLE_NOT_FOUND':
      return 'Tavolo non trovato.';
    case 'TABLE_ALREADY_OCCUPIED':
      return 'Tavolo gia occupato da un ordine attivo.';
    case 'TABLE_ALREADY_EXISTS':
      return 'Esiste gia un tavolo con questo numero.';
    case 'ORDER_NOT_FOUND':
      return 'Ordine non trovato.';
    case 'RESTAURANT_NOT_FOUND':
      return 'Ristorante non trovato.';
    case 'ORDER_NOT_ACTIVE':
      return 'Ordine gia chiuso.';
    case 'ITEM_NOT_FOUND':
      return 'Elemento non trovato nell\'ordine.';
    case 'ITEM_NOT_EDITABLE':
      return 'Elemento gia in lavorazione, non modificabile.';
    case 'INVALID_ITEM_TRANSITION':
      return 'Transizione di stato non ammessa per questo elemento.';
    case 'STALE_ORDER':
      return 'Ordine modificato da un altro utente. Ricarica e riprova.';
    case 'ORDER_CONTENTION':
      return 'Troppe richieste concorrenti. Riprova tra qualche secondo.';
    case 'NOT_OWNER':
      return 'Non sei autorizzato a modificare questa risorsa.';
    case 'INVALID_PAYLOAD':
      return err.message || 'Dati non validi. Controlla i campi e riprova.';
    case 'PAYMENT_DECLINED':
      return 'Pagamento rifiutato. Riprova o utilizza un altro metodo.';
    case 'PAYMENT_TIMEOUT':
      return 'Timeout nel pagamento. Riprova.';
    case 'PAYMENT_UNAVAILABLE':
      return 'Servizio di pagamento non disponibile. Riprova.';
    case 'POS_DEVICE_NOT_FOUND':
      return 'Nessun dispositivo POS/RT collegato. Collega l\'app del dispositivo e riprova.';
    case 'EMAIL_DELIVERY_FAILED':
      return 'Email al cliente non inviata. Controlla la configurazione SMTP e riprova.';
    default:
      return err.message || 'Si e\' verificato un errore durante l\'operazione.';
  }
};

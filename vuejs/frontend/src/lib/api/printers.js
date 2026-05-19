import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

/**
 * Carica la configurazione stampanti del ristoratore autenticato.
 * GET /api/restaurant-printer-config/me
 * Resp: { data: { auto_print_kitchen_enabled, stations_json, cash_devices_json, plan } }
 */
export const getPrinterConfig = async (token) => {
  const resp = await fetch(`${API_BASE}/api/restaurant-printer-config/me`, {
    headers: authHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Salva (crea o aggiorna) la configurazione stampanti.
 * PUT /api/restaurant-printer-config/me
 * Body: { auto_print_kitchen_enabled, stations_json, cash_devices_json }
 */
export const savePrinterConfig = async (body, token) => {
  const resp = await fetch(`${API_BASE}/api/restaurant-printer-config/me`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Test stampa: accoda un job sintetico sulla stampante specificata.
 * POST /api/restaurant-printer-config/test-print
 * Body: { role: 'station'|'cash', key: string }
 */
export const testPrint = async ({ role, key }, token) => {
  const resp = await fetch(`${API_BASE}/api/restaurant-printer-config/test-print`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ role, key }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

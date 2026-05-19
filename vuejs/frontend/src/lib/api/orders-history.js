// API client per lo storico ordini archiviati (OrderArchive).
//
// Endpoint backend: GET /api/order-archives/history
// Vedi `strapi/src/api/order-archive/controllers/order-archive.js`.

import { API_BASE, buildApiError, authHeaders } from './_base.js';

const BASE = `${API_BASE}/api/order-archives`;

/**
 * Storico ordini chiusi raggruppati per giorno.
 *
 * filters:
 *   - from: ISO date (default: now - 30gg lato server)
 *   - to:   ISO date (default: now)
 *   - service_type: "table" | "takeaway" | undefined (tutti)
 *   - page, pageSize (default 1/50, max 200)
 *
 * Risposta:
 *   {
 *     data: { days: [{ date, totals, orders: [...] }] },
 *     meta: { page, pageSize, total, range: { from, to } }
 *   }
 */
export const fetchOrdersHistory = async (token, filters = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  }
  const q = params.toString() ? `?${params.toString()}` : '';
  const resp = await fetch(`${BASE}/history${q}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

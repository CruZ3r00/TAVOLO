import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

/**
 * Genera un pairing-token single-use per accoppiare un nuovo pos-rt-service.
 * Auth: JWT utente (Bearer). TTL configurabile in minuti (5..1440, default 30).
 * Il token in chiaro e' ritornato UNA VOLTA: l'utente lo deve copiare/scansionare.
 */
export const generatePosPairingToken = async (token, ttlMinutes = 30) => {
  const resp = await fetch(`${API_BASE}/api/pos-devices/me/pairing-token`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ttl_minutes: ttlMinutes }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data; // { token, expires_at, ttl_minutes }
};

/**
 * Lista dei device POS collegati all'utente (auth JWT).
 */
export const fetchPosDevices = async (token) => {
  const resp = await fetch(`${API_BASE}/api/pos-devices`, {
    headers: authHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return Array.isArray(payload.data) ? payload.data : [];
};

/**
 * Revoca un device POS (setta revoked_at server-side, chiude eventuali WS).
 */
export const revokePosDevice = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/pos-devices/${encodeURIComponent(documentId)}/revoke`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!resp.ok && resp.status !== 204) {
    const payload = await resp.json().catch(() => ({}));
    throw buildApiError(resp, payload);
  }
  return true;
};

/**
 * URL di download per installer Windows/Linux/macOS + link store mobile.
 * Endpoint pubblico (no auth richiesta).
 */
export const fetchPosInstallers = async () => {
  const resp = await fetch(`${API_BASE}/api/pos-devices/installers`, {
    headers: { Accept: 'application/json' },
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data || {};
};

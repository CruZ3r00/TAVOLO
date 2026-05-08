import { API_BASE, buildApiError, jsonHeaders } from './_base.js';

export const fetchBillingStatus = async (token) => {
  const resp = await fetch(`${API_BASE}/api/billing/status`, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const createBillingCheckoutSession = async (plan, token) => {
  const resp = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ plan }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

// Sync esplicito post-checkout: chiama il backend con il session_id ricevuto
// dal success_url di Stripe Checkout. Il backend recupera la session da Stripe
// e aggiorna i campi subscription_* dell'utente immediatamente (senza
// dipendere dal webhook).
export const syncBillingCheckout = async (sessionId, token) => {
  const resp = await fetch(`${API_BASE}/api/billing/sync-checkout`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ session_id: sessionId }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const createBillingPortalSession = async (token) => {
  const resp = await fetch(`${API_BASE}/api/billing/portal`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const changeBillingPlan = async (plan, token) => {
  const resp = await fetch(`${API_BASE}/api/billing/change-plan`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ plan }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const cancelBillingSubscription = async (token) => {
  const resp = await fetch(`${API_BASE}/api/billing/cancel`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const reactivateBillingSubscription = async (token) => {
  const resp = await fetch(`${API_BASE}/api/billing/reactivate`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

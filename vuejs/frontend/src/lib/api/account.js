import { API_BASE, buildApiError, jsonHeaders } from './_base.js';
import { fetchBillingStatus } from './billing.js';

/**
 * Lista delle impostazioni staff (cameriere/cucina/bar/pizzeria/cucina_sg) per
 * l'utente corrente. Se il backend non ha l'endpoint o restituisce 404, usa
 * un fallback derivato dal piano di sottoscrizione.
 */
export const fetchStaffSettings = async (token) => {
  try {
    const resp = await fetch(`${API_BASE}/api/account/staff`, {
      method: 'GET',
      headers: jsonHeaders(token),
    });
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && Array.isArray(payload?.data)) return payload.data;
    if (!resp.ok && resp.status !== 404) throw buildApiError(resp, payload);
  } catch (err) {
    if (err?.status && err.status !== 404) throw err;
  }

  const billing = await fetchBillingStatus(token);
  const starterAllowed = billing?.subscription_plan === 'starter' || billing?.subscription_plan === 'pro';
  const proAllowed = billing?.subscription_plan === 'pro';
  const kitchenLabel = billing?.subscription_plan === 'starter' ? 'Ordini' : 'Cucina';
  return [
    { role: 'cameriere', label: 'Sala', active: true, plan_allowed: starterAllowed, can_toggle: false, blocked: !starterAllowed, username: null, pending_backend: true, routing_allowed: false, routing_blocked_reason: 'backend_pending', subscription_plan: billing?.subscription_plan || null, categories: [] },
    { role: 'cucina', label: kitchenLabel, active: true, plan_allowed: starterAllowed, can_toggle: starterAllowed, blocked: !starterAllowed, username: null, pending_backend: true, routing_allowed: false, routing_blocked_reason: 'backend_pending', subscription_plan: billing?.subscription_plan || null, categories: [] },
    { role: 'bar', label: 'Bar', active: true, plan_allowed: proAllowed, can_toggle: proAllowed, blocked: !proAllowed, username: null, pending_backend: true, routing_allowed: false, routing_blocked_reason: 'backend_pending', subscription_plan: billing?.subscription_plan || null, categories: [] },
    { role: 'pizzeria', label: 'Pizzeria', active: true, plan_allowed: proAllowed, can_toggle: proAllowed, blocked: !proAllowed, username: null, pending_backend: true, routing_allowed: false, routing_blocked_reason: 'backend_pending', subscription_plan: billing?.subscription_plan || null, categories: [] },
    { role: 'cucina_sg', label: 'Cucina SG', active: true, plan_allowed: proAllowed, can_toggle: proAllowed, blocked: !proAllowed, username: null, pending_backend: true, routing_allowed: false, routing_blocked_reason: 'backend_pending', subscription_plan: billing?.subscription_plan || null, categories: [] },
  ];
};

export const updateStaffSetting = async (role, active, token) => {
  const resp = await fetch(`${API_BASE}/api/account/staff/${encodeURIComponent(role)}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ staff_department_role: role, active }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const updateCategoryRouting = async (category, role, token) => {
  const resp = await fetch(`${API_BASE}/api/account/category-routing`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ category, staff_role: role }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Recupera la WebsiteConfig dell'owner (include cover_charge, restaurant_name,
 * coperti, logo, ecc.). Resp { data: config | null }.
 */
export const fetchWebsiteConfig = async (token) => {
  const resp = await fetch(`${API_BASE}/api/account/website-config`, {
    method: 'GET',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload?.data || null;
};

/**
 * Aggiorna SOLO il campo cover_charge mantenendo gli altri valori esistenti
 * (l'endpoint PUT richiede sempre coperti_invernali). Lettura preliminare per
 * non sovrascrivere i campi non passati.
 */
export const updateCoverCharge = async (coverCharge, token) => {
  const current = await fetchWebsiteConfig(token);
  const body = {
    restaurant_name: current?.restaurant_name || '',
    coperti_invernali: current?.coperti_invernali ?? 1,
    coperti_estivi: current?.coperti_estivi ?? null,
    cover_charge: Number(coverCharge),
  };
  const resp = await fetch(`${API_BASE}/api/account/website-config`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload?.data || null;
};

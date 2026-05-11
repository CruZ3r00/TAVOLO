import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';
import { fetchOrders } from './orders.js';

export const fetchTakeaways = async (params = {}, token) => (
  fetchOrders({ ...params, service_type: 'takeaway' }, token)
);

export const createTakeaway = async (body, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const updateTakeaway = async (documentId, body, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways/${documentId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const acceptTakeaway = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways/${documentId}/accept`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const rejectTakeaway = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways/${documentId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (resp.status === 204) return true;
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const sendTakeawayToDepartments = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways/${documentId}/send`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

export const pickupTakeaway = async (documentId, token) => {
  const resp = await fetch(`${API_BASE}/api/takeaways/${documentId}/pickup`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

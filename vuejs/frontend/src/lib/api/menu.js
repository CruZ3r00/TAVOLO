import { API_BASE, buildApiError, jsonHeaders, authHeaders } from './_base.js';

/**
 * Recupera gli elementi del menu di un utente tramite il suo documentId.
 * Normalizza la risposta dell'API pubblica sul formato legacy usato dal frontend.
 */
export const fetchMenuElements = async (id) => {
  const emptyMenu = {
    data: [{ documentId: id, fk_elements: [] }],
  };

  try {
    const response = await fetch(`${API_BASE}/api/menus/public/${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const payload = await response.json();
      const elements = Array.isArray(payload?.data?.elements)
        ? payload.data.elements.map((element) => ({
            id: element.documentId,
            documentId: element.documentId,
            name: element.name,
            price: Number.isFinite(Number(element.price)) ? Number(element.price) : 0,
            category: element.category,
            ingredients: Array.isArray(element.ingredients) ? element.ingredients : [],
            allergens: Array.isArray(element.allergens) ? element.allergens : [],
            available: element.available !== false,
            image: element.image_full_url || element.image_url
              ? { url: element.image_full_url || element.image_url }
              : null,
          }))
        : [];

      return { data: [{ documentId: id, fk_elements: elements }] };
    }

    return emptyMenu;
  } catch (error) {
    console.error(error);
    return emptyMenu;
  }
};

/**
 * Invia un file (PDF/immagine) al backend per estrazione OCR + strutturazione LLM.
 */
export const importMenuAnalyze = async (file, token) => {
  const fd = new FormData();
  fd.append('file', file);
  const resp = await fetch(`${API_BASE}/api/menus/import/analyze`, {
    method: 'POST',
    headers: authHeaders(token),
    body: fd,
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

/**
 * Bulk insert degli elementi estratti nel menu utente.
 * mode: "append" per aggiungere, "replace" per sostituire (transazione lato backend).
 */
export const importMenuBulk = async ({ mode, elements }, token) => {
  const resp = await fetch(`${API_BASE}/api/menus/import/bulk`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ mode, elements }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
};

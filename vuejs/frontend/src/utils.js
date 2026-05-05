import qs from 'qs';

/**
 * Recupera gli elementi del menu di un utente tramite il suo documentId.
 * Normalizza la risposta dell'API pubblica sul formato legacy usato dal frontend.
 */
export const fetchMenuElements = async (id) => {
    const emptyMenu = {
        data: [
            {
                documentId: id,
                fk_elements: [],
            },
        ],
    };

    try {
        const response = await fetch(`${API_BASE}/api/menus/public/${id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
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

            return {
                data: [
                    {
                        documentId: id,
                        fk_elements: elements,
                    },
                ],
            };
        }

        return emptyMenu;
    } catch (error) {
        console.error(error);
        return emptyMenu;
    }
}

/**
 * Recupera il menu pubblico di un ristorante tramite la nuova API pubblica.
 * GET /api/menus/public/:userDocumentId
 */
export const fetchPublicMenu = async (userDocumentId) => {
    try {
        const response = await fetch(`${API_BASE}/api/menus/public/${userDocumentId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        }
        return null;
    } catch (error) {
        console.error('Errore nel recupero del menu pubblico:', error);
        return null;
    }
};

/**
 * URL base delle API Strapi
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

/**
 * Invia un file (PDF/immagine) al backend per estrazione OCR + strutturazione LLM.
 * Ritorna i dati normalizzati in caso di successo, propaga errore con status/code altrimenti.
 */
export const importMenuAnalyze = async (file, token) => {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`${API_BASE}/api/menus/import/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(payload?.error?.message || `Analisi fallita (HTTP ${resp.status})`);
        err.status = resp.status;
        err.code = payload?.error?.code || null;
        throw err;
    }
    return payload.data;
};

/**
 * Bulk insert degli elementi estratti nel menu utente.
 * mode: "append" per aggiungere, "replace" per sostituire (transazione lato backend).
 */
export const importMenuBulk = async ({ mode, elements }, token) => {
    const resp = await fetch(`${API_BASE}/api/menus/import/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, elements }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(payload?.error?.message || `Import fallito (HTTP ${resp.status})`);
        err.status = resp.status;
        throw err;
    }
    return payload.data;
};

// ============================================================================
// Reservations API — ADR-0001
// ============================================================================

/**
 * Costruisce un Error arricchito con code/status/details per gestire in UI
 * i vari scenari (OVERBOOKING, CAPACITY_NOT_CONFIGURED, ecc).
 */
// ============================================================================
// Billing API (Stripe SaaS subscriptions)
// ============================================================================

const buildBillingError = (resp, payload) => {
    const err = new Error(payload?.error?.message || payload?.message || `Richiesta fallita (HTTP ${resp.status})`);
    err.status = resp.status;
    err.code = payload?.error?.code || null;
    return err;
};

export const fetchBillingStatus = async (token) => {
    const resp = await fetch(`${API_BASE}/api/billing/status`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

export const createBillingCheckoutSession = async (plan, token) => {
    const resp = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

// Sync esplicito post-checkout: chiama il backend con il session_id ricevuto
// dal success_url di Stripe Checkout. Il backend recupera la session da Stripe
// e aggiorna i campi subscription_* dell'utente immediatamente (senza
// dipendere dal webhook).
export const syncBillingCheckout = async (sessionId, token) => {
    const resp = await fetch(`${API_BASE}/api/billing/sync-checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

export const createBillingPortalSession = async (token) => {
    const resp = await fetch(`${API_BASE}/api/billing/portal`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

export const changeBillingPlan = async (plan, token) => {
    const resp = await fetch(`${API_BASE}/api/billing/change-plan`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

export const cancelBillingSubscription = async (token) => {
    const resp = await fetch(`${API_BASE}/api/billing/cancel`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

export const reactivateBillingSubscription = async (token) => {
    const resp = await fetch(`${API_BASE}/api/billing/reactivate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildBillingError(resp, payload);
    return payload.data;
};

// ============================================================================
// Reservations API
// ============================================================================

const buildReservationError = (resp, payload) => {
    const err = new Error(payload?.error?.message || `Richiesta fallita (HTTP ${resp.status})`);
    err.status = resp.status;
    err.code = payload?.error?.code || null;
    err.details = payload?.error?.details || null;
    return err;
};

export const isSubscriptionRequiredError = (err) => (
    err?.status === 402 || err?.code === 'SUBSCRIPTION_REQUIRED'
);

/**
 * Lista paginata delle prenotazioni del ristoratore corrente.
 * params: { status?, from?, to?, page?, pageSize? }
 */
export const fetchReservations = async (params = {}, token) => {
    const query = qs.stringify(params, { skipNulls: true });
    const url = query
        ? `${API_BASE}/api/reservations?${query}`
        : `${API_BASE}/api/reservations`;
    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildReservationError(resp, payload);
    return payload;
};

/**
 * Crea una prenotazione dal gestionale (owner).
 * payload: { datetime (ISO), guests, customer: { name, phone, email?, notes? }, status? }
 */
export const createReservation = async (payload, token) => {
    const resp = await fetch(`${API_BASE}/api/reservations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildReservationError(resp, body);
    return body.data;
};

/**
 * Aggiorna lo status di una prenotazione secondo la FSM.
 * status: 'confirmed' | 'completed' | 'cancelled'.
 * Nota: 'at_restaurant' non e' ammesso qui — usa seatReservation.
 */
export const updateReservationStatus = async (documentId, status, token) => {
    const resp = await fetch(`${API_BASE}/api/reservations/${documentId}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildReservationError(resp, payload);
    return payload.data;
};

/**
 * Fa accomodare una prenotazione su un tavolo.
 * body: { table_id (documentId), covers? }
 * Risposta: { reservation, order: { documentId } }
 */
export const seatReservation = async (documentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/reservations/${documentId}/seat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildReservationError(resp, payload);
    return payload.data;
};

/**
 * Registra un walk-in (cliente senza prenotazione) su un tavolo libero.
 * body: { table_id, number_of_people, customer_name?, phone?, covers?, notes? }
 * Risposta: { reservation, order: { documentId } }
 */
export const createWalkin = async (body, token) => {
    const resp = await fetch(`${API_BASE}/api/reservations/walkin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildReservationError(resp, payload);
    return payload.data;
};

// ============================================================================
// Tables API — ADR-0002
// ============================================================================

const buildOrderError = (resp, payload) => {
    const err = new Error(payload?.error?.message || `Richiesta fallita (HTTP ${resp.status})`);
    err.status = resp.status;
    err.code = payload?.error?.code || null;
    err.details = payload?.error?.details || null;
    return err;
};

/**
 * Lista tavoli del ristorante corrente.
 */
export const fetchTables = async (token) => {
    const resp = await fetch(`${API_BASE}/api/tables`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload;
};

/**
 * Crea un nuovo tavolo.
 * body: { number, seats, area? }
 */
export const createTable = async (body, token) => {
    const resp = await fetch(`${API_BASE}/api/tables`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Aggiorna un tavolo.
 * body: { number?, seats?, area? }
 */
export const updateTable = async (documentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/tables/${documentId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Elimina un tavolo.
 */
export const deleteTable = async (documentId, token) => {
    const resp = await fetch(`${API_BASE}/api/tables/${documentId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (resp.status === 204) return true;
    const payload = await resp.json().catch(() => ({}));
    throw buildOrderError(resp, payload);
};

// ============================================================================
// Orders API — ADR-0002
// ============================================================================

/**
 * Lista paginata degli ordini del ristoratore corrente.
 * params: { status?, table?, from?, to?, page?, pageSize? }
 */
export const fetchOrders = async (params = {}, token) => {
    const query = qs.stringify(params, { skipNulls: true });
    const url = query
        ? `${API_BASE}/api/orders?${query}`
        : `${API_BASE}/api/orders`;
    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload;
};

/**
 * Apre un ordine su un tavolo.
 * body: { table_id (documentId), covers? }
 */
export const openOrder = async (body, token) => {
    const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Dettaglio ordine con items.
 */
export const fetchOrder = async (documentId, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${documentId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Totale derivato in tempo reale.
 */
export const fetchOrderTotal = async (documentId, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${documentId}/total`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Aggiunge item all'ordine.
 * body: { element_id?, name?, price?, quantity, category?, course?, notes?, lock_version? }
 */
export const addOrderItem = async (orderDocumentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Aggiorna quantity/notes di un item.
 * body: { quantity?, notes?, lock_version? }
 */
export const updateOrderItem = async (orderDocumentId, itemDocumentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Elimina un item dall'ordine.
 */
export const deleteOrderItem = async (orderDocumentId, itemDocumentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Transizione stato item (FSM).
 * body: { status }
 */
export const updateItemStatus = async (orderDocumentId, itemDocumentId, status, token, params = {}) => {
    const query = qs.stringify(params, { skipNulls: true });
    const url = query
        ? `${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}/status?${query}`
        : `${API_BASE}/api/orders/${orderDocumentId}/items/${itemDocumentId}/status`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
    return payload.data;
};

/**
 * Chiude ordine + pagamento.
 * body: { payment_method?, lock_version? }
 */
export const closeOrder = async (documentId, body, token) => {
    const resp = await fetch(`${API_BASE}/api/orders/${documentId}/close`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw buildOrderError(resp, payload);
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
        default:
            return err.message || 'Si e\' verificato un errore durante l\'operazione.';
    }
};

/**
 * Mappa un errore (con err.code dall'API) in un messaggio italiano pronto da
 * mostrare all'utente. Se err.details contiene capacity/current/requested per
 * OVERBOOKING, il messaggio include i numeri.
 */
export const reservationErrorMessage = (err) => {
    if (!err) return 'Errore sconosciuto.';
    const code = err.code;
    const d = err.details || {};
    switch (code) {
        case 'OVERBOOKING': {
            if (Number.isFinite(d.capacity) && Number.isFinite(d.current)) {
                const remaining = Math.max(0, d.capacity - d.current);
                return `Capacità raggiunta per questo slot. Coperti disponibili: ${remaining} su ${d.capacity}.`;
            }
            return 'Capacità raggiunta per lo slot selezionato. Prova un altro orario.';
        }
        case 'CAPACITY_NOT_CONFIGURED':
            return 'Capacità del ristorante non configurata. Vai in Configurazione Sito e imposta i coperti invernali.';
        case 'INVALID_TRANSITION':
            return err.message || 'Transizione di stato non ammessa per questa prenotazione.';
        case 'NOT_OWNER':
            return 'Non sei autorizzato a modificare questa prenotazione.';
        case 'RESTAURANT_NOT_FOUND':
            return 'Ristorante non trovato.';
        case 'RESERVATION_NOT_FOUND':
            return 'Prenotazione non trovata.';
        case 'TABLE_NOT_FOUND':
            return 'Tavolo non trovato.';
        case 'TABLE_ALREADY_OCCUPIED':
            return 'Tavolo gia occupato. Scegline un altro libero.';
        case 'RESERVATION_ALREADY_SEATED':
            return 'Prenotazione gia in sala.';
        case 'INVALID_PAYLOAD':
            return err.message || 'Dati non validi. Controlla i campi e riprova.';
        case 'RESERVATION_CONTENTION':
            return 'Troppe richieste concorrenti in questo momento. Riprova tra qualche secondo.';
        default:
            return err.message || 'Si è verificato un errore durante l\'operazione.';
    }
};

// ──────────────────────────────────────────────────────────────────────
// POS/Cassa fiscale (Fase 5)
// ──────────────────────────────────────────────────────────────────────

/**
 * Genera un pairing-token single-use per accoppiare un nuovo pos-rt-service.
 * Auth: JWT utente (Bearer). TTL configurabile in minuti (5..1440, default 30).
 * Il token in chiaro è ritornato UNA VOLTA: l'utente lo deve copiare/scansionare.
 */
export const generatePosPairingToken = async (token, ttlMinutes = 30) => {
    const resp = await fetch(`${API_BASE}/api/pos-devices/me/pairing-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ttl_minutes: ttlMinutes }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(payload?.error?.message || `Generazione token fallita (HTTP ${resp.status})`);
        err.status = resp.status;
        err.code = payload?.error?.code || null;
        throw err;
    }
    return payload.data; // { token, expires_at, ttl_minutes }
};

/**
 * Lista dei device POS collegati all'utente (auth JWT).
 */
export const fetchPosDevices = async (token) => {
    const resp = await fetch(`${API_BASE}/api/pos-devices`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(payload?.error?.message || `Impossibile caricare i device (HTTP ${resp.status})`);
        err.status = resp.status;
        err.code = payload?.error?.code || null;
        throw err;
    }
    return Array.isArray(payload.data) ? payload.data : [];
};

/**
 * Revoca un device POS (setta revoked_at server-side, chiude eventuali WS).
 */
export const revokePosDevice = async (documentId, token) => {
    const resp = await fetch(`${API_BASE}/api/pos-devices/${encodeURIComponent(documentId)}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok && resp.status !== 204) {
        const payload = await resp.json().catch(() => ({}));
        const err = new Error(payload?.error?.message || `Revoca fallita (HTTP ${resp.status})`);
        err.status = resp.status;
        err.code = payload?.error?.code || null;
        throw err;
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
    if (!resp.ok) {
        const err = new Error(payload?.error?.message || `Errore caricamento installer (HTTP ${resp.status})`);
        err.status = resp.status;
        throw err;
    }
    return payload.data || {};
};

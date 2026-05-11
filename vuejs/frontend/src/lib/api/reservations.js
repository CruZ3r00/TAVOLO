import qs from 'qs';
import { API_BASE, buildApiError, jsonHeaders } from './_base.js';

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
    headers: jsonHeaders(token),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload;
};

/**
 * Crea una prenotazione dal gestionale (owner).
 * payload: { datetime (ISO), guests, customer: { name, phone, email?, notes? }, status? }
 */
export const createReservation = async (payload, token) => {
  const resp = await fetch(`${API_BASE}/api/reservations`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, body);
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
    headers: jsonHeaders(token),
    body: JSON.stringify({ status }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
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
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
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
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw buildApiError(resp, payload);
  return payload.data;
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
    case 'EMAIL_DELIVERY_FAILED':
      return 'Email al cliente non inviata. Controlla la configurazione SMTP e riprova.';
    default:
      return err.message || 'Si è verificato un errore durante l\'operazione.';
  }
};

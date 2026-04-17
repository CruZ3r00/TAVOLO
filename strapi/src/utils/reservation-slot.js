'use strict';

/**
 * Reservation slot utility.
 *
 * Calcola lo slot canonico (bucket) a cui appartiene un datetime di
 * prenotazione. Gli slot sono fissi e allineati da mezzanotte UTC, con
 * durata configurabile via env `RESERVATION_SLOT_MINUTES` (default 120).
 *
 * Una prenotazione al datetime t appartiene allo slot
 *   floor((t - midnight_UTC) / slot) * slot
 * Il valore ritornato è serializzato in ISO 8601 così da essere
 * indicizzabile su colonna `datetime` e comparabile esattamente.
 *
 * Vedi ADR-0001.3 per motivazione della scelta slot fissi vs mobili.
 */

const DEFAULT_SLOT_MINUTES = 120;

function getSlotMs() {
  const raw = parseInt(process.env.RESERVATION_SLOT_MINUTES || '', 10);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOT_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * Ritorna l'ISO string della mezzanotte UTC a cui inizia lo slot.
 * @param {string|Date} datetimeInput
 * @returns {string} ISO 8601
 */
function computeSlotStart(datetimeInput) {
  const date = datetimeInput instanceof Date ? datetimeInput : new Date(datetimeInput);
  if (Number.isNaN(date.getTime())) {
    throw new Error('computeSlotStart: datetime non valido.');
  }
  const slotMs = getSlotMs();
  const t = date.getTime();
  const dayStart = Math.floor(t / 86400000) * 86400000;
  const offsetInDay = t - dayStart;
  const bucketOffset = Math.floor(offsetInDay / slotMs) * slotMs;
  return new Date(dayStart + bucketOffset).toISOString();
}

/**
 * Ritorna l'ISO string della fine esclusiva dello slot.
 */
function computeSlotEnd(datetimeInput) {
  const start = new Date(computeSlotStart(datetimeInput)).getTime();
  return new Date(start + getSlotMs()).toISOString();
}

/**
 * Compone un ISO datetime a partire da date (YYYY-MM-DD) e time (HH:MM o HH:MM:SS).
 * Il risultato è interpretato come UTC (coerente con `slot_start`).
 */
function composeDatetime(dateISO, timeISO) {
  if (typeof dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error('composeDatetime: date non valida (atteso YYYY-MM-DD).');
  }
  if (typeof timeISO !== 'string' || !/^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(timeISO)) {
    throw new Error('composeDatetime: time non valida (atteso HH:MM o HH:MM:SS).');
  }
  const timePart = timeISO.length === 5 ? `${timeISO}:00` : timeISO;
  const composed = `${dateISO}T${timePart}.000Z`;
  const parsed = new Date(composed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('composeDatetime: combinazione date/time non parseable.');
  }
  return parsed.toISOString();
}

module.exports = {
  computeSlotStart,
  computeSlotEnd,
  composeDatetime,
  getSlotMs,
};

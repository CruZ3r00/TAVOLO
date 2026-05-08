// Formattatori condivisi (currency, date, time, slot). Pure JS, framework-agnostic.

const EUR_FORMATTER = typeof Intl !== 'undefined' && Intl.NumberFormat
  ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
  : null;

/**
 * Formatta un numero come prezzo in euro (es. 12.5 -> "€ 12,50").
 * Fallback su browser senza Intl: stringa "€ 12,50".
 */
export const formatCurrency = (value) => {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  if (EUR_FORMATTER) return EUR_FORMATTER.format(v);
  return '€ ' + v.toFixed(2).replace('.', ',');
};

const DATE_FORMATTER = typeof Intl !== 'undefined' && Intl.DateTimeFormat
  ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : null;

const DATETIME_FORMATTER = typeof Intl !== 'undefined' && Intl.DateTimeFormat
  ? new Intl.DateTimeFormat('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  : null;

const TIME_FORMATTER = typeof Intl !== 'undefined' && Intl.DateTimeFormat
  ? new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
  : null;

const pad2 = (n) => (n < 10 ? '0' + n : String(n));

const toDate = (input) => {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'string' || typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Formatta una data in formato italiano gg/mm/aaaa.
 */
export const formatDate = (input) => {
  const d = toDate(input);
  if (!d) return '';
  if (DATE_FORMATTER) return DATE_FORMATTER.format(d);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * Formatta data + ora in formato italiano gg/mm/aaaa hh:mm.
 */
export const formatDateTime = (input) => {
  const d = toDate(input);
  if (!d) return '';
  if (DATETIME_FORMATTER) return DATETIME_FORMATTER.format(d);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Formatta un orario hh:mm.
 */
export const formatTime = (input) => {
  const d = toDate(input);
  if (!d) return '';
  if (TIME_FORMATTER) return TIME_FORMATTER.format(d);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Calcola lo slot iniziale (bucket di 30 minuti) per una data/ora.
 * Es. 19:23 -> "19:00", 19:42 -> "19:30". Compatibile con il backend Reservations.
 */
export const slotStartFromTime = (input) => {
  const d = toDate(input);
  if (!d) return '';
  const minutes = d.getMinutes() < 30 ? 0 : 30;
  return `${pad2(d.getHours())}:${pad2(minutes)}`;
};

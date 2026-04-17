'use strict';

/**
 * Season utility.
 *
 * Decide se una data ricade nella stagione estiva del ristorante e, sulla
 * base della stagione, restituisce la capacità attiva della WebsiteConfig
 * del ristorante.
 *
 * La stagione estiva è configurata tramite env `SUMMER_MONTHS` come CSV di
 * numeri mese 1..12. Default: "4,5,6,7,8,9,10" (aprile-ottobre incluso).
 *
 * Il calcolo del mese è fatto in UTC per allinearsi ai datetime salvati da
 * Strapi. Vedi ADR-0001.2 per la limitazione nota del timezone edge-case
 * alla mezzanotte.
 */

const DEFAULT_SUMMER_MONTHS = '4,5,6,7,8,9,10';

/**
 * Ritorna true se la data appartiene alla stagione estiva configurata.
 * @param {string|Date} dateInput ISO string o Date.
 * @returns {boolean}
 */
function isSummerSeason(dateInput) {
  const raw = process.env.SUMMER_MONTHS || DEFAULT_SUMMER_MONTHS;
  const months = raw
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return false;
  const month = date.getUTCMonth() + 1;
  return months.includes(month);
}

/**
 * Ritorna la capacità attiva del ristorante per la data indicata.
 * - In estate usa `coperti_estivi` se valorizzato, altrimenti fallback su
 *   `coperti_invernali`.
 * - In inverno usa `coperti_invernali`.
 *
 * @param {object} websiteConfig record `website_configs` (columns snake_case
 *   o oggetto Document API con camelCase — supporta entrambi).
 * @param {string|Date} dateInput
 * @returns {number|null} capacità intera, oppure null se non configurata.
 */
function capacityFor(websiteConfig, dateInput) {
  if (!websiteConfig) return null;
  const wintry = websiteConfig.coperti_invernali ?? websiteConfig.copertiInvernali ?? null;
  const summer = websiteConfig.coperti_estivi ?? websiteConfig.copertiEstivi ?? null;
  if (wintry == null) return null;
  if (isSummerSeason(dateInput)) {
    return summer == null ? wintry : summer;
  }
  return wintry;
}

module.exports = {
  isSummerSeason,
  capacityFor,
};

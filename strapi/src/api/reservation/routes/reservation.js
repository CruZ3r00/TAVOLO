'use strict';

/**
 * Core Content API disabled.
 *
 * Reservations are exposed only through custom tenant-aware routes in
 * custom-reservation.js. The Strapi admin/content-manager uses its own admin
 * API, so the generic public Content API router is not needed here.
 */

module.exports = { routes: [] };

'use strict';

/**
 * Internal-only. Pos-job non è esposto via REST pubblica.
 * I device lo accedono tramite gli endpoint /api/pos-devices/me/jobs
 * (auth X-Device-Token), gestiti da `controllers/pos-device.js`.
 */
module.exports = {};

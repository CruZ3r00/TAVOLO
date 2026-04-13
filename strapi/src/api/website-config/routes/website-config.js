'use strict';

/**
 * website-config router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::website-config.website-config');

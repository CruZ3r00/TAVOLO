'use strict';

/**
 * website-config service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::website-config.website-config');

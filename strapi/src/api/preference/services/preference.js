'use strict';

/**
 * preference service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::preference.preference');

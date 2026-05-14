'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::inventory-movement.inventory-movement');

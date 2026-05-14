'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::restock-order.restock-order');

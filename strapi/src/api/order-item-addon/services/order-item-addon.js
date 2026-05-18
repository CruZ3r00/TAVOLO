'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::order-item-addon.order-item-addon');

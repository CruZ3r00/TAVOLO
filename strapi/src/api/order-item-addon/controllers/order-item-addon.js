'use strict';

/**
 * order-item-addon controller
 *
 * Boilerplate richiesto da Strapi. Le operazioni sugli addon passano dal
 * controller order (addItem / deleteItem) che li snapshotta dall'ingredient.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::order-item-addon.order-item-addon');

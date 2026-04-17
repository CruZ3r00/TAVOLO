'use strict';

/**
 * order-item controller
 *
 * Tutte le operazioni sugli order-item passano dal controller order.
 * Questo file e' il boilerplate richiesto da Strapi per registrare il content type.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::order-item.order-item');

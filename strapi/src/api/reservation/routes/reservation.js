'use strict';

/**
 * reservation router (core, used solo in admin).
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::reservation.reservation', {
  config: {
    find:    { auth: false, policies: ['admin::isAuthenticatedAdmin'] },
    findOne: { auth: false, policies: ['admin::isAuthenticatedAdmin'] },
    create:  { auth: false, policies: ['admin::isAuthenticatedAdmin'] },
    update:  { auth: false, policies: ['admin::isAuthenticatedAdmin'] },
    delete:  { auth: false, policies: ['admin::isAuthenticatedAdmin'] },
  },
});

'use strict';

module.exports = {
  async up(knex) {
    const hasRestaurantName = await knex.schema.hasColumn('up_users', 'signup_restaurant_name');
    const hasCopertiInvernali = await knex.schema.hasColumn('up_users', 'signup_coperti_invernali');
    const hasCopertiEstivi = await knex.schema.hasColumn('up_users', 'signup_coperti_estivi');

    if (!hasRestaurantName || !hasCopertiInvernali || !hasCopertiEstivi) {
      await knex.schema.alterTable('up_users', (table) => {
        if (!hasRestaurantName) table.string('signup_restaurant_name').nullable();
        if (!hasCopertiInvernali) table.integer('signup_coperti_invernali').nullable();
        if (!hasCopertiEstivi) table.integer('signup_coperti_estivi').nullable();
      });
    }
  },

  async down(knex) {
    const hasRestaurantName = await knex.schema.hasColumn('up_users', 'signup_restaurant_name');
    const hasCopertiInvernali = await knex.schema.hasColumn('up_users', 'signup_coperti_invernali');
    const hasCopertiEstivi = await knex.schema.hasColumn('up_users', 'signup_coperti_estivi');

    if (hasRestaurantName || hasCopertiInvernali || hasCopertiEstivi) {
      await knex.schema.alterTable('up_users', (table) => {
        if (hasRestaurantName) table.dropColumn('signup_restaurant_name');
        if (hasCopertiInvernali) table.dropColumn('signup_coperti_invernali');
        if (hasCopertiEstivi) table.dropColumn('signup_coperti_estivi');
      });
    }
  },
};

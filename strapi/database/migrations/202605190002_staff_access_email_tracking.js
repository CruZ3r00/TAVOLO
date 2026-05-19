'use strict';

module.exports = {
  async up(knex) {
    const hasSentAt = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_at');
    const hasSentPlan = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_plan');
    const hasSignupRestaurantName = await knex.schema.hasColumn('up_users', 'signup_restaurant_name');
    const hasSignupCopertiInvernali = await knex.schema.hasColumn('up_users', 'signup_coperti_invernali');
    const hasSignupCopertiEstivi = await knex.schema.hasColumn('up_users', 'signup_coperti_estivi');
    if (!hasSentAt || !hasSentPlan || !hasSignupRestaurantName || !hasSignupCopertiInvernali || !hasSignupCopertiEstivi) {
      await knex.schema.alterTable('up_users', (table) => {
        if (!hasSentAt) table.timestamp('staff_access_email_sent_at', { useTz: true }).nullable();
        if (!hasSentPlan) table.string('staff_access_email_sent_plan').nullable();
        if (!hasSignupRestaurantName) table.string('signup_restaurant_name').nullable();
        if (!hasSignupCopertiInvernali) table.integer('signup_coperti_invernali').nullable();
        if (!hasSignupCopertiEstivi) table.integer('signup_coperti_estivi').nullable();
      });
    }
  },

  async down(knex) {
    const hasSentAt = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_at');
    const hasSentPlan = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_plan');
    const hasSignupRestaurantName = await knex.schema.hasColumn('up_users', 'signup_restaurant_name');
    const hasSignupCopertiInvernali = await knex.schema.hasColumn('up_users', 'signup_coperti_invernali');
    const hasSignupCopertiEstivi = await knex.schema.hasColumn('up_users', 'signup_coperti_estivi');
    if (hasSentAt || hasSentPlan || hasSignupRestaurantName || hasSignupCopertiInvernali || hasSignupCopertiEstivi) {
      await knex.schema.alterTable('up_users', (table) => {
        if (hasSentAt) table.dropColumn('staff_access_email_sent_at');
        if (hasSentPlan) table.dropColumn('staff_access_email_sent_plan');
        if (hasSignupRestaurantName) table.dropColumn('signup_restaurant_name');
        if (hasSignupCopertiInvernali) table.dropColumn('signup_coperti_invernali');
        if (hasSignupCopertiEstivi) table.dropColumn('signup_coperti_estivi');
      });
    }
  },
};

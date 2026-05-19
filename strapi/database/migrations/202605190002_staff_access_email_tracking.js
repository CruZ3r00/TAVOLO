'use strict';

module.exports = {
  async up(knex) {
    const hasSentAt = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_at');
    const hasSentPlan = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_plan');
    if (!hasSentAt || !hasSentPlan) {
      await knex.schema.alterTable('up_users', (table) => {
        if (!hasSentAt) table.timestamp('staff_access_email_sent_at', { useTz: true }).nullable();
        if (!hasSentPlan) table.string('staff_access_email_sent_plan').nullable();
      });
    }
  },

  async down(knex) {
    const hasSentAt = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_at');
    const hasSentPlan = await knex.schema.hasColumn('up_users', 'staff_access_email_sent_plan');
    if (hasSentAt || hasSentPlan) {
      await knex.schema.alterTable('up_users', (table) => {
        if (hasSentAt) table.dropColumn('staff_access_email_sent_at');
        if (hasSentPlan) table.dropColumn('staff_access_email_sent_plan');
      });
    }
  },
};

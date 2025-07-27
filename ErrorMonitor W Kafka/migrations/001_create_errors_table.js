/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('errors', function (table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('message').notNullable();
    table.text('severity').notNullable();
    table.text('category').notNullable();
    table.text('description');
    table.text('stack');
    table.text('url');
    table.text('user_agent');
    table.boolean('resolved').defaultTo(false);
    table.timestamp('resolved_at');
    table.text('resolve_comment');
    table.text('resolved_by');
    table.timestamps(true, true); // created_at, updated_at

    // Indexes for better performance
    table.index('resolved');
    table.index('category');
    table.index('severity');
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('errors');
};
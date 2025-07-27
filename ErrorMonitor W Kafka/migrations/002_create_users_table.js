exports.up = function (knex) {
  return knex.schema.createTable('users', function (table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('password').notNullable();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.string('role').defaultTo('user'); // 'admin', 'user'
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login');
    table.timestamps(true, true);

    table.index('email');
    table.index('role');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
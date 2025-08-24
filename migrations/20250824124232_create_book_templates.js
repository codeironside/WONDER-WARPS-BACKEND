// File: knex_migrate.js

exports.up = function (knex) {
    return knex.schema.createTable('book_templates', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.foreign('user_id').references('id').inTable('users');
        table.string('title').notNullable();
        table.text('description');
        table.jsonb('cover_images').notNullable().defaultTo('[]');
        table.string('genre').nullable();
        table.jsonb('characters').nullable();
        table.string('age_range').nullable();
        table.string('ideal_for').nullable();
        table.decimal('price', 8, 2).nullable();
        table.string('status').defaultTo('draft');
        table.jsonb('chapters').notNullable().defaultTo('[]');
        table.jsonb('keywords').nullable();
        table.boolean('is_personalizable').notNullable().defaultTo(true);
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('book_templates');
};

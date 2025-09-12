/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema.createTable("roles", (table) => {
    table.increments("id").primary();
    table.integer("role_id").notNullable();
    table.string("role_name").nullable();
    table.string("description").nullable();
    table.string("level").nullable();
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.dropTable("roles");
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("user_name").notNullable().unique();
    table.string("firstname").notNullable();
    table.string("lastname").notNullable();
    table.string("phonenumber").notNullable();
    table.string("email").notNullable().unique();
    table.string("password").notNullable();
    table.integer("role").notNullable().references("role_id").inTable("roles");
    table.timestamps(true, true);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.dropTable("users");
}

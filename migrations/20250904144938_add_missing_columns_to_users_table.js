/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.string("firstname").nullable();
    table.string("lastname").nullable();
    table.string("phonenumber").nullable();
    table.integer("role").nullable();
    table.renameColumn("password_hash", "password");
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.dropColumn("firstname");
    table.dropColumn("lastname");
    table.dropColumn("phonenumber");
    table.dropColumn("role");
    table.renameColumn("password", "password_hash");
  });
}

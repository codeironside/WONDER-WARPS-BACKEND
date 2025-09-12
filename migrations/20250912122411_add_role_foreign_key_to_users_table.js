// A new migration file (e.g., 20250912123500_add_role_foreign_key_to_users_table.js)

export function up(knex) {
  return knex.schema.alterTable("users", function (table) {
    // Add the foreign key constraint
    table.foreign("role").references("roles.role_id").onDelete("SET NULL");
  });
}

export function down(knex) {
  return knex.schema.alterTable("users", function (table) {
    // Drop the foreign key constraint
    table.dropForeign("role");
  });
}

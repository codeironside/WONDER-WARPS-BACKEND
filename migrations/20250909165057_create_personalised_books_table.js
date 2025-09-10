export function up(knex) {
  return knex.schema.createTable("personalized_books", (table) => {
    table.increments("id").primary();
    table.integer("original_template_id").unsigned().notNullable();
    table
      .foreign("original_template_id")
      .references("id")
      .inTable("story_book_templates")
      .onDelete("CASCADE");
    table.integer("user_id").unsigned().notNullable();
    table
      .foreign("user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("child_name").notNullable();
    table.integer("child_age").nullable();
    table.decimal("price", 8, 2).notNullable();
    table.boolean("is_paid").notNullable().defaultTo(false);
    table.string("payment_id").nullable();
    table.string("gender_preference").nullable();
    table.timestamp("payment_date").nullable();
    table.jsonb("personalized_content").notNullable();
    table.timestamps(true, true);
    table.index("user_id");
    table.index("original_template_id");
    table.index("is_paid");
  });
}

export function down(knex) {
  return knex.schema.dropTable("personalized_books");
}

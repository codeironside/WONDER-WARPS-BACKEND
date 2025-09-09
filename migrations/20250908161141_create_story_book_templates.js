export function up(knex) {
  return knex.schema.createTable("story_book_templates", (table) => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.foreign("user_id").references("id").inTable("users");
    table.string("book_title").notNullable();
    table.text("description");
    table.jsonb("cover_image").notNullable().defaultTo("[]");
    table.string("genre").nullable();
    table.string("author").nullable();
    table.string("age_min").notNullable();
    table.string("hair_type").notNullable();
    table.string("hair_style").notNullable();
    table.string("hair_color");
    table.string("eye_color");
    table.string("clothing");
    table.string("gender").notNullable();
    table.string("suggested_font").notNullable();
    table.string("skin_tone").nullable();
    table.string("age_max").nullable();
    table.decimal("price", 8, 2).nullable();
    table.jsonb("chapters").notNullable().defaultTo("[]");
    table.specificType("keywords", "text[]").nullable().defaultTo("{}");
    table.boolean("is_personalizable").notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
}

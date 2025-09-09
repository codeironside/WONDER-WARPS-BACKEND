export function up(knex) {
  return knex.schema.createTable("chapters", (table) => {
    table.increments("id").primary();
    table.integer("book_template_id").unsigned().notNullable();
    table
      .foreign("book_template_id")
      .references("id")
      .inTable("story_book_templates")
      .onDelete("CASCADE");
    table.text("chapter_title").notNullable(); // Changed to text for longer titles
    table.text("chapter_content").notNullable();
    table.text("image_description").nullable(); // Changed to text for longer descriptions
    table.string("image_position").nullable();
    table.text("image_url").nullable(); // Changed to text for longer URLs
    table.timestamps(true, true);
  });
}

export function down(knex) {
  return knex.schema.dropTable("chapters");
}

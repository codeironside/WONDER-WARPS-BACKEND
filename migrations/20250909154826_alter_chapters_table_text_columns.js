export async function up(knex) {
  await knex.schema.alterTable("chapters", (table) => {
    table.text("chapter_title").alter();
    table.text("image_description").alter();
    table.text("image_url").alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("chapters", (table) => {
    table.string("chapter_title", 255).alter();
    table.string("image_description", 255).alter();
    table.string("image_url", 255).alter();
  });
}

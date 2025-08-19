
export function up(knex) {
    return knex.schema.createTable('otps', (table) => {
        table.increments('id').primary();
        table.string('user_id', 255).notNullable().unique();
        table.string('otp_hash', 255).notNullable();
        table.timestamp('expires_at').notNullable();
    });
};


export function down(knex) {
    return knex.schema.dropTable('otps');
};

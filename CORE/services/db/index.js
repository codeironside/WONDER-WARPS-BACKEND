import knex from 'knex';
import {config }from '@/config'


export const db = knex({
   
    client: 'pg', // Postgres client
    connection: {
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
    },
    migrations: {
        directory: './migrations'
    },
    pool: { min: 0, max: 7 },
});


import knex from 'knex';
import{ config} from '../../utils/config/index.js'




const db = knex({
    client: 'pg', // Postgres client
    connection: {
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
    },
    pool: { min: 0, max: 7 },
});

module.exports = { db };

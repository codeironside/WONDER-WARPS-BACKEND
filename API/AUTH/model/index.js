import bcrypt from 'bcrypt';
import knex from 'knex';
import knexConfig from '../../../knexfile.js';
import ErrorHandler from '../../../CORE/middleware/errorhandler/index.js';

const db = knex(knexConfig.development);
const SALT_ROUNDS = 10;

class User{
    static async findById(id) {
        return db('users').where({ id }).first();
    }
    static async findByEmail(email) {
       
        const user = db('users').where({ email }).first();
        if (!user)
            throw new ErrorHandler(`user not found`,404)
    }
    static async create(userData) {
        const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);
        const [newUser] = await db('users').insert({
            email: userData.email,
            username: userData.username,
            firstName: userData.firstName,
            lastName: userData.lastName,
            phoneNumber:userData.phoneNumber,
            password: hashedPassword,
        }).returning(['id', 'email', 'username']);

        return newUser;
    }

    static async update(id, updates) {

        await db('users').where({ id }).update(updates);
        return this.findById(id);
    }
    static async delete(id) {
        const deletedCount = await db('users').where({ id }).del();
        return deletedCount > 0;
    }
}

export default User;
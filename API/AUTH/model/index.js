import bcrypt from "bcrypt";
import knex from "knex";
import knexConfig from "../../../knexfile.js";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import RoleModel from "../../ROLES/model/index.js";

const db = knex(knexConfig.development);
const SALT_ROUNDS = 10;

class User {
  static async findById(id) {
    return db("users").where({ id }).first();
  }
  static async findUser(identifier) {
    const user = await db("users")
      .where("email", identifier)
      .orWhere("username", identifier)
      .orWhere("phonenumber", identifier)
      .first();
    return user;
  }
  static async signIn(identifier, password) {
    const user = await this.findUser(identifier);
    if (user && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }
  static async create(userData) {
    const existingUser = await db("users")
      .where("email", userData.email)
      .orWhere("username", userData.userName)
      .orWhere("phonenumber", userData.phoneNumber)
      .first();
    if (existingUser) {
      if (existingUser.email === userData.email) {
        throw new ErrorHandler("Email is already in use.", 406);
      }
      if (existingUser.username === userData.userName) {
        throw new ErrorHandler("Username is already in use.", 406);
      }
      if (existingUser.phonenumber === userData.phoneNumber) {
        throw new ErrorHandler("Phone number is already in use.", 406);
      }
    }
    const getRoleId = await RoleModel.getRoleName(userData.role);
    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

    const [newUser] = await db("users")
      .insert({
        email: userData.email,
        username: userData.userName,
        firstname: userData.firstName,
        lastname: userData.lastName,
        phonenumber: userData.phoneNumber,
        password: hashedPassword,
        role: getRoleId,
      })
      .returning(["email", "username", "firstname", "lastname", "phonenumber"]);

    return newUser;
  }

  static async update(id, updates) {
    await db("users").where({ id }).update(updates);
    return this.findById(id);
  }
  static async delete(id) {
    const deletedCount = await db("users").where({ id }).del();
    return deletedCount > 0;
  }
}

export default User;

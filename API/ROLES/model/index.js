import knex from "knex";
import knexfile from "../../../knexfile.js";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
const db = knex(knexfile.development);

export default class RoleModel {
  static async createRole({ role_id, role_name, description, level }) {
    try {
      const existingRole = await db("roles")
        .where({ role_id })
        .orWhere({ role_name })
        .first();

      if (existingRole) {
        throw new ErrorHandler("Role with this ID or name already exists", 403);
      }
      const [newRole] = await db("roles")
        .insert({
          role_id,
          role_name,
          description,
          level,
        })
        .returning("*");

      return newRole;
    } catch (error) {
      throw new Error("Error creating role: " + error.message);
    }
  }

  static async getAllRoles() {
    try {
      return await db("roles").select("*");
    } catch (error) {
      throw new Error("Error fetching roles: " + error.message);
    }
  }
  static async getRoleName(name) {
    try {
      const role = await db("roles").where({ role_name: name }).first();
      if (!role) {
        throw new ErrorHandler("Role not found", 404);
      }
      return role.role_id;
    } catch (error) {
      throw new ErrorHandler("Error fetching role: " + error.message);
    }
  }
  static async getByID(id) {
    try {
      const role = await db("roles").where({ role_id: id }).first();
      if (!role) {
        throw new ErrorHandler("Role not found", 404);
      }
      return role.role_name;
    } catch (error) {
      throw new ErrorHandler("Error fetching role: " + error.message);
    }
  }
  static async updateRole(id, { role_id, role_name, description, level }) {
    try {
      const updatedRole = await db("roles")
        .where({ id })
        .update({
          role_id,
          role_name,
          description,
          level,
        })
        .returning("*");

      if (!updatedRole.length) {
        throw new Error("Role not found");
      }

      return updatedRole[0];
    } catch (error) {
      throw new Error("Error updating role: " + error.message);
    }
  }
  static async deleteRole(id) {
    try {
      const deletedRole = await db("roles").where({ id }).del().returning("*");

      if (!deletedRole.length) {
        throw new Error("Role not found");
      }

      return deletedRole[0];
    } catch (error) {
      throw new Error("Error deleting role: " + error.message);
    }
  }
}

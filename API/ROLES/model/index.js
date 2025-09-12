import mongoose from "mongoose";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";

const roleSchema = new mongoose.Schema(
  {
    role_id: { type: Number, required: true, unique: true },
    role_name: { type: String, required: true, unique: true },
    description: { type: String },
    level: { type: String, required: true },
  },
  { timestamps: true },
);

const Role = mongoose.model("Role", roleSchema);

export default class RoleModel {
  static async createRole({ role_id, role_name, description, level }) {
    try {
      const existingRole = await Role.findOne({
        $or: [{ role_id }, { role_name }],
      });

      if (existingRole) {
        throw new ErrorHandler("Role with this ID or name already exists", 403);
      }
      const newRole = new Role({
        role_id,
        role_name,
        description,
        level,
      });
      await newRole.save();
      return newRole;
    } catch (error) {
      throw new Error("Error creating role: " + error.message);
    }
  }

  static async getAllRoles() {
    try {
      return await Role.find({});
    } catch (error) {
      throw new Error("Error fetching roles: " + error.message);
    }
  }
  static async getRoleName(name) {
    try {
      const role = await Role.findOne({ role_name: name });
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
      const role = await Role.findOne({ role_id: id });
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
      const updatedRole = await Role.findByIdAndUpdate(
        id,
        {
          role_id,
          role_name,
          description,
          level,
        },
        { new: true },
      );

      if (!updatedRole) {
        throw new Error("Role not found");
      }

      return updatedRole;
    } catch (error) {
      throw new Error("Error updating role: " + error.message);
    }
  }
  static async deleteRole(id) {
    try {
      const deletedRole = await Role.findByIdAndDelete(id);

      if (!deletedRole) {
        throw new Error("Role not found");
      }

      return deletedRole;
    } catch (error) {
      throw new Error("Error deleting role: " + error.message);
    }
  }
}

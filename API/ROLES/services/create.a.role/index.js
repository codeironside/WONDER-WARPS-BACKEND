import RoleModel from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export const createRole = async (req, res, next) => {
  const { role_id, role_name, level, description } = req.body;

  try {
    if ((!role_id, !role_name))
      throw new ErrorHandler("body can not be empty", 402);
    const newRole = await RoleModel.createRole({
      role_id,
      role_name,
      level,
      description,
    });
    sendResponse(res, 201, "Role created successfully.", {
      role_id: newRole.role_id,
      role_name: newRole.role_name,
      level: newRole.level,
      description: newRole.description,
    });
    logger.info(`role with role_id:-${role_id} has been created`);
  } catch (error) {
    if (error.message.includes("already exists")) {
      throw new ErrorHandler("Role already exist", 409);
    }
    console.log(error);
    throw new ErrorHandler("Failed to create role,", 500);
  }
};

import jwt from "jsonwebtoken";
import User from "../../../API/AUTH/model/index.js";
import { config } from "../../utils/config/index.js";
import ErrorHandler from "../errorhandler/index.js";
import logger from "../../utils/logger/index.js";
import RoleModel from "../../../API/ROLES/model/index.js";

const JWT_SECRET = config.app.JWT_SECRET;
export const authorize = (allowedRoles) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ErrorHandler("Not Authorized", 401);
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const { id } = decoded;
      const user = await User.findById(id);
      if (!user) {
        throw new ErrorHandler("User not found", 401);
      }
      const userRole = await RoleModel.getByID(user.role);

      if (!allowedRoles.includes(userRole)) {
        throw new ErrorHandler(
          " you do not have the permissions to perform this action",
          403,
        );
      }

      logger.warn(
        `user with ID ${id} accessed a protected route with role ${user.role}`,
      );
      req.token = token;
      req.user = user;
      next();
    } catch (error) {
      console.log(error);
      if (error.name === "TokenExpiredError") {
        throw new ErrorHandler("Access token has expired.", 401);
      } else if (error.name === "JsonWebTokenError") {
        throw new ErrorHandler("Invalid access token.", 401);
      } else {
        throw new ErrorHandler(`${error.message}`, 500);
      }
    }
  };
};

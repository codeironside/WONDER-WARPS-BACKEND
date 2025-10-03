// APP/APP_ROUTER/controllers/userController.js

import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
export async function createUser(req, res, next) {
  const { email, password, userName, firstName, lastName, phoneNumber, role } =
    req.body;
  console.log(req.body);
  try {
    if (!email || !password || !firstName || !lastName || !phoneNumber || !role)
      throw new ErrorHandler("body can not be empty", 402);
    const userData = {
      email,
      password,
      phoneNumber,
      userName,
      firstName,
      lastName,
      role: role,
    };
    const response = await User.createAdmin(userData);
    sendResponse(res, 201, response.message, { user: response.newUser });
    logger.info(`user with email:-${email} has been created`);
  } catch (error) {
    console.log(error);
    if (error.message.includes("already exists")) {
      throw new ErrorHandler(
        "User with this email or username already exists.",
        409,
      );
    }
    throw new ErrorHandler("Failed to create user.", 500);
  }
}

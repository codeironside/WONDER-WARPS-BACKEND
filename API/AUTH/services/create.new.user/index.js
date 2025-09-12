// APP/APP_ROUTER/controllers/userController.js

import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
export async function createUser(req, res, next) {
  const { email, password, userName, firstName, lastName, phoneNumber } =
    req.body;

  try {
    if (!email || !password || !firstName || !lastName || !phoneNumber)
      throw new ErrorHandler("body can not be empty", 402);
    const newUser = await User.createUser({
      email,
      password,
      phoneNumber,
      userName,
      firstName,
      lastName,
      role: "Admin",
    });
    sendResponse(res, 201, "User created successfully.", {
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      userName: newUser.username,
      phoneNumber: newUser.phonenumber,
      role: "Admin",
    });
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

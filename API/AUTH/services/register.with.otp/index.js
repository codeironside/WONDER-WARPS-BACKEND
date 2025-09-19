import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import emailService from "../../../../CORE/services/Email/index.js";

export async function registerWithOTP(req, res, next) {
  try {
    const { username, firstName, lastName, phoneNumber, email, password } =
      req.body;

    if (
      !username ||
      !firstName ||
      !lastName ||
      !phoneNumber ||
      !email ||
      !password
    ) {
      throw new ErrorHandler("All fields are required", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ErrorHandler("Invalid email format", 400);
    }
    if (password.length < 8) {
      throw new ErrorHandler(
        "Password must be at least 8 characters long",
        400,
      );
    }

    const userData = {
      username,
      firstName,
      lastName,
      phoneNumber,
      email,
      password,
    };

    const result = await User.registerWithOTP(userData);
    console.log(result);
    await emailService.sendOTPEmail(
      userData.email,
      result.otp,
      userData.username,
    );
    logger.info(`OTP for ${email}: ${result.otp}`);

    sendResponse(res, 200, result.message, {
      tempUserId: result.tempUserId,
    });
  } catch (error) {
    next(error);
  }
}

import User from "../models/User.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export async function registerWithOTP(req, res, next) {
  try {
    const {
      username,
      firstName,
      lastName,
      phoneNumber,
      email,
      password,
      role,
    } = req.body;

    // Validate required fields
    if (
      !username ||
      !firstName ||
      !lastName ||
      !phoneNumber ||
      !email ||
      !password ||
      !role
    ) {
      throw new ErrorHandler("All fields are required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ErrorHandler("Invalid email format", 400);
    }

    // Validate password strength
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
      role,
    };

    const result = await User.registerWithOTP(userData);

    // In a real application, you would send the OTP via email or SMS here
    // For now, we'll log it and include it in the response for testing
    logger.info(`OTP for ${email}: ${result.otp}`);

    sendResponse(res, 200, result.message, {
      tempUserId: result.tempUserId,
      // Include OTP in response for testing - remove in production
      otp: result.otp,
    });
  } catch (error) {
    next(error);
  }
}

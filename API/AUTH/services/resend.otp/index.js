import User from "../models/User.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export async function resendOTP(req, res, next) {
  try {
    const { tempUserId } = req.body;

    if (!tempUserId) {
      throw new ErrorHandler("Temp user ID is required", 400);
    }

    const result = await User.resendOTP(tempUserId);

    // In a real application, you would send the OTP via email or SMS here
    // For now, we'll log it and include it in the response for testing
    logger.info(`Resent OTP for temp user ${tempUserId}: ${result.otp}`);

    sendResponse(res, 200, result.message, {
      // Include OTP in response for testing - remove in production
      otp: result.otp,
    });
  } catch (error) {
    next(error);
  }
}

import User from "../models/User.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export async function verifyOTP(req, res, next) {
  try {
    const { tempUserId, otp } = req.body;

    if (!tempUserId || !otp) {
      throw new ErrorHandler("Temp user ID and OTP are required", 400);
    }

    const user = await User.verifyOTP(tempUserId, otp);

    logger.info(`User ${user.email} verified successfully`);
    sendResponse(res, 200, "User registered successfully", {});
  } catch (error) {
    next(error);
  }
}

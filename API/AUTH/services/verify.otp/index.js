import User from "../../model/index.js"
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import emailService from "../../../../CORE/services/Email/index.js";

export async function verifyRegisterOTP(req, res, next) {
  try {
    const { tempUserId, otp } = req.body;

    if (!tempUserId || !otp) {
      throw new ErrorHandler("Invalid Request", 400);
    }

    const user = await User.verifyOTP(tempUserId, otp);
    await emailService.sendWelcomeEmail(
      user.email,
      user.username,
    );

    logger.info(`User ${user.email} verified successfully`);
    sendResponse(res, 200, "User registered successfully, Proceed to login ", {});
  } catch (error) {
    next(error);
  }
}

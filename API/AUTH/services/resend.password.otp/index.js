import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const resendPasswordResetOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ErrorHandler("Email is required", 400);
    }

    const eligibility = await User.canResendOTP("password-reset", email);
    if (!eligibility.canResend) {
      throw new ErrorHandler(eligibility.reason, 429);
    }

    const result = await User.resendPasswordResetOTP(email, req);

    sendResponse(res, 200, result.message, {
      success: result.success,
      resendCount: result.resendCount,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    next(error);
  }
};

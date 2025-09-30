import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
export const verifyPasswordResetOTP = async (req, res, next) => {
  try {
    const { otpId, otp, email } = req.body;

    if (!otpId || !otp || !email) {
      throw new ErrorHandler("OTP ID, OTP, and email are required", 400);
    }

    const result = await User.verifyPasswordResetOTP(otpId, otp, email);

    sendResponse(res, 200, result.message, {
      success: result.success,
      token: result.token,
    });
  } catch (error) {
    console.log(error)
    next(error);
  }
};

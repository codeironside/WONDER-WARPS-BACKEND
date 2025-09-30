import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ErrorHandler("Email is required", 400);
    }

    const result = await User.requestPasswordReset(email, req);

    sendResponse(res, 200, result.message, {
      success: result.success,
      expiresIn: result.expiresIn,
      otpId: result.otpId
    });
  } catch (error) {
    next(error);
  }
};

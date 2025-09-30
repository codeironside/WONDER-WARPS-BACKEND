import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
export const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    const result = await User.resetPasswordWithOTP(
      resetToken,
      newPassword,
      confirmPassword,
    );

    sendResponse(res, 200, result.message, {
      success: result.success,
    });
  } catch (error) {
    next(error);
  }
};

import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const changePassword = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const userId = req.user._id;

    const result = await User.changePassword(
      userId,
      newPassword,
      confirmPassword,
      req,
    );

    sendResponse(res, 200, result.message, {
      success: result.success,
    });
  } catch (error) {
    next(error);
  }
};

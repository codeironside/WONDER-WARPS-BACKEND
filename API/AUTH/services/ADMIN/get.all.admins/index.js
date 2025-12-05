import User from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";

export const getAllAdmins = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const filters = req.query;

    const result = await User.getAllAdmins(currentUserId, filters);

    sendResponse(res, 200, "Admins retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

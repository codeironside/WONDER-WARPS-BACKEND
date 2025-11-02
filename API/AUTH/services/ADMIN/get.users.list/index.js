import User from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
export async function getAdminUsersList(req, res, next) {
  try {
    const currentUserId = req.user._id;
    const filters = req.query;

    const result = await User.getUsersList(currentUserId, filters);

    sendResponse(res, 200, "Users retrieved successfully", result);
  } catch (error) {
    next(error);
  }
}

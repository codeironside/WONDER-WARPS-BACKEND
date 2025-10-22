import User from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
export async function getAdminUsersList(req, res, next) {
  try {
    const usersList = await User.getUsersList(req.query);
    sendResponse(res, 200, "Users list retrieved successfully", usersList);
  } catch (error) {
    next(error);
  }
}

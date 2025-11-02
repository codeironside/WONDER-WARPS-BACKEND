import User from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";

export const createAdminUser = async (req, res, next) => {
  try {
    const result = await User.createAdmin(req.body);
    sendResponse(res, 201, result.message, result.newUser);
  } catch (error) {
    next(error);
  }
};

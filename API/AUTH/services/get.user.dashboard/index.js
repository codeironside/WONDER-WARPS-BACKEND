import User from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
export async function getUserDashboard(req, res, next) {
  try {
    const userId = req.user.id;
    const dashboardData = await User.getUserDashboard(userId);

    sendResponse(
      res,
      200,
      "User dashboard data retrieved successfully",
      dashboardData,
    );
  } catch (error) {
    next(error);
  }
}

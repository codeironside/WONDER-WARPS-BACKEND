import User from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";

export async function getAdminDashboard(req, res, next) {
  try {
    const dashboardStats = await User.getDashboardStats();
    const adminInfo = await User.findById(req.user._id).select("-password");
    dashboardStats.admin_info = adminInfo;

    sendResponse(
      res,
      200,
      "Dashboard statistics retrieved successfully",
      dashboardStats,
    );
  } catch (error) {
    next(error);
  }
}

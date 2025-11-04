import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const getEmailStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const stats = await emailModel.getEmailStats(userId);

    sendResponse(res, 200, "Email statistics retrieved successfully", {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();
export const syncEmails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;

    const syncResults = await emailModel.syncUserEmails(userId, userEmail);

    sendResponse(res, 200, "Emails synchronized successfully", {
      success: true,
      syncResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { emailId } = req.params;
    const { isRead = true } = req.body;

    const email = await emailModel.markAsRead(userId, emailId, isRead);

    sendResponse(res, 200, `Email marked as ${isRead ? "read" : "unread"}`, {
      success: true,
      emailId: emailId,
      isRead: email.flags.isRead,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

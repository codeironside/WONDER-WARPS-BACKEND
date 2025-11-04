import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const replyToEmail = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { emailId } = req.params;
    const { content, template, options = {} } = req.body;

    const result = await emailModel.replyToEmail(
      userId,
      emailId,
      content,
      template,
      options,
    );

    sendResponse(res, 200, "Reply sent successfully", {
      success: true,
      originalEmailId: emailId,
      replyMessageId: result.messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const sendTemplatedEmail = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { to, subject, template, data, options = {} } = req.body;

    const result = await emailModel.sendTemplatedEmail(
      userId,
      to,
      subject,
      template,
      data,
      options,
    );

    sendResponse(res, 200, "Email sent successfully", {
      success: true,
      messageId: result.messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

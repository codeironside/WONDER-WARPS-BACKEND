import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const unlinkWorkMailAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await emailModel.unlinkWorkMailAccount(userId);

    sendResponse(res, 200, "WorkMail account unlinked successfully", {
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

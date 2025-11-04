import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const getEmail = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { emailId } = req.params;

    const email = await emailModel.getEmail(userId, emailId);

    sendResponse(res, 200, "Email retrieved successfully", {
      success: true,
      data: email,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const linkWorkMailAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;

    const result = await emailModel.verifyAndLinkWorkMailAccount(
      userId,
      userEmail,
    );

    sendResponse(res, 200, "WorkMail account linked successfully", {
      success: true,
      workmailEnabled: true,
      workmailEmail: result.workmailEmail,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

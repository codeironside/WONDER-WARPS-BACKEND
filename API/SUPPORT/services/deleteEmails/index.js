import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const deleteEmail = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { emailId } = req.params;
    const { permanent = false } = req.body;

    const result = await emailModel.deleteEmail(userId, emailId, permanent);

    sendResponse(res, 200, "Email deleted successfully", {
      success: true,
      emailId: emailId,
      permanent: permanent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

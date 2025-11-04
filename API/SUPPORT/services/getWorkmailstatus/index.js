import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const getWorkMailStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const workmailUser = await emailModel.getWorkMailUser(userId);

    sendResponse(res, 200, "WorkMail status retrieved successfully", {
      success: true,
      workmailEnabled: true,
      workmailEmail: workmailUser.workmailEmail,
      isVerified: workmailUser.isVerified,
      lastVerifiedAt: workmailUser.lastVerifiedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

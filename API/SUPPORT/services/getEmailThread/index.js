import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const getEmailThread = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { threadId } = req.params;
    const { useCache = true } = req.query;

    const thread = await emailModel.getEmailThread(userId, threadId, {
      useCache: useCache === "true",
    });

    sendResponse(res, 200, "Email thread retrieved successfully", {
      success: true,
      data: thread,
      threadId: threadId,
      count: thread.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

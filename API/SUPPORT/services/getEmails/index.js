import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const getEmails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      page,
      limit,
      search,
      isRead,
      threadId,
      useCache = true,
    } = req.query;

    const filters = {};
    const options = { page, limit, useCache: useCache === "true" };

    if (search) filters.search = search;
    if (isRead !== undefined) filters.isRead = isRead === "true";
    if (threadId) filters.threadId = threadId;

    const result = await emailModel.getUserEmails(userId, filters, options);

    sendResponse(res, 200, "Emails retrieved successfully", {
      success: true,
      data: result.emails,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

import { EmailModel } from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

const emailModel = new EmailModel();

export const searchEmails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { query, page = 1, limit = 20 } = req.query;

    const result = await emailModel.getUserEmails(
      userId,
      { search: query },
      { page: parseInt(page), limit: parseInt(limit), useCache: false },
    );

    sendResponse(res, 200, "Email search completed", {
      success: true,
      data: result.emails,
      query: query,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

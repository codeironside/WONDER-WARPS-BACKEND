import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getAllbookTemplatesforadmin = async (req, res, next) => {
  try {
    const { page, userId, limit, includePublic } = req.query;
    const result = await BookTemplate.findAllForUser(userId, {
      page,
      limit,
      includePublic,
    });

    sendResponse(res, 200, "Book templates retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to retrieve book templates: ${error}`);
    next(new ErrorHandler("Failed to retrieve book templates.", 500));
  }
};

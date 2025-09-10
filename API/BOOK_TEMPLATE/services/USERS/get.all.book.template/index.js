import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getAllbookTemplatesForUsers = async (req, res, next) => {
  try {
    const templates = await BookTemplate.findAllByUser();

    sendResponse(res, 200, "Book templates retrieved successfully", templates);
  } catch (error) {
    logger.error(`Failed to retrieve book templates: ${error.message}`);
    next(new ErrorHandler("Failed to retrieve book templates.", 500));
  }
};

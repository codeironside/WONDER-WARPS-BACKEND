import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getAllbookTemplates = async (req, res, next) => {
  try {
    const {
      limit = 20,
      offset = 0,
      includeChapters = false,
      minimal = false,
    } = req.query;
    const templates = await BookTemplate.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeChapters: includeChapters === "true",
      minimal: minimal === "true",
    });

    sendResponse(res, 200, "Book templates retrieved successfully", templates);
  } catch (error) {
    logger.error(`Failed to retrieve book templates: ${error.message}`);
    next(new ErrorHandler("Failed to retrieve book templates.", 500));
  }
};

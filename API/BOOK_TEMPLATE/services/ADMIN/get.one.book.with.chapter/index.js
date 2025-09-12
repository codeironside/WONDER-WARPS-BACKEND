import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getOneBookWithChapterForAdmin = async (req, res, next) => {
  try {
    const { templateId } = req.query;
    const template = await BookTemplate.findByIdWithChapters(templateId);

    sendResponse(res, 200, "Book templates retrieved successfully", template);
  } catch (error) {
    logger.error(`Failed to retrieve book templates: ${error}`);
    next(new ErrorHandler("Failed to retrieve book template.", 500));
  }
};

import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const updateChapters = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { chapters } = req.body;

    const result = await BookTemplate.updateChapters(id, chapters, userId);

    sendResponse(res, 200, result.message, result);
  } catch (error) {
    logger.error(`Failed to update chapters: ${error}`);
    next(error);
  }
};

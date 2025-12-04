import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const updateBookProcessedStatus = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const { is_processed } = req.body;

    if (typeof is_processed !== "boolean") {
      throw new ErrorHandler("is_processed must be a boolean", 400);
    }

    const book = await PersonalizedBook.updateProcessedStatus(
      bookId,
      is_processed,
    );

    logger.info(`Book processing status updated by admin`, {
      bookId,
      is_processed,
      adminId: req.user?._id,
    });

    sendResponse(
      res,
      200,
      `Book processing status ${is_processed ? "set to processed" : "set to not processed"} successfully`,
      book,
    );
  } catch (error) {
    logger.error(`Failed to update book processing status: ${error.message}`);
    next(error);
  }
};

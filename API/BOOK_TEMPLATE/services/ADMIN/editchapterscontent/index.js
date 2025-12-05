import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const updateBookWithChapters = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    if (updateData.chapters && Array.isArray(updateData.chapters)) {
      for (const chapter of updateData.chapters) {
        if (
          chapter.image_description !== undefined ||
          chapter.image_position !== undefined ||
          chapter.image_url !== undefined
        ) {
          return next(
            new ErrorHandler(
              "Cannot update image_description, image_position, or image_url through this endpoint. Use the image upload endpoint instead.",
              400,
            ),
          );
        }
      }
    }

    const updatedBook = await BookTemplate.updateBookWithChapters(
      id,
      updateData,
      userId,
    );

    sendResponse(
      res,
      200,
      "Book and chapters updated successfully",
      updatedBook,
    );
  } catch (error) {
    logger.error(`Failed to update book with chapters: ${error}`);
    next(error);
  }
};

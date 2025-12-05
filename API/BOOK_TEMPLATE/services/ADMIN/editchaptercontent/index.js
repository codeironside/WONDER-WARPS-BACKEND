import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const updateChapters = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { chapters } = req.body;

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      return next(
        new ErrorHandler(
          "Chapters array is required and must not be empty",
          400,
        ),
      );
    }

    for (const chapter of chapters) {
      if (
        chapter.image_description !== undefined ||
        chapter.image_position !== undefined ||
        chapter.image_url !== undefined ||
        chapter.order !== undefined ||
        chapter.book_template_id !== undefined ||
        chapter.createdAt !== undefined ||
        chapter.updatedAt !== undefined
      ) {
        return next(
          new ErrorHandler(
            "Only chapter_title and chapter_content can be updated through this endpoint",
            400,
          ),
        );
      }
    }

    const result = await BookTemplate.updateChapters(id, chapters, userId);

    sendResponse(res, 200, result.message, result);
  } catch (error) {
    logger.error(`Failed to update chapters: ${error}`);
    next(error);
  }
};

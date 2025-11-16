import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import StorybookGenerator from "../../../../../CORE/services/openai/generateBookTemplate/index.js";
const storybookGenerator = new StorybookGenerator();

export const saveTemplateAndGenerateMedia = (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      book_title,
      chapters,
      story, // This object contains 'price'
      ...restOfTemplate // Collect all other fields (age_max, name, etc.)
    } = req.body;

    if (!book_title || typeof book_title !== "string") {
      throw new ErrorHandler("Valid 'book_title' is required.", 400);
    }

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      throw new ErrorHandler("Valid 'chapters' array is required.", 400);
    }

    if (!story || !story.price) {
      throw new ErrorHandler(
        "Price information is missing from the 'story' object.",
        400,
      );
    }

    const storyTemplate = {
      book_title,
      chapters,
      story,
      ...restOfTemplate,
    };

    sendResponse(
      res,
      202,
      "Book creation is in progress. It will appear in your account shortly.",
      { status: "PENDING", title: storyTemplate.book_title },
    );

    storybookGenerator
      .generateMediaAndSave(storyTemplate, userId)
      .then(() => {
        logger.info(
          `[Job Success] Media generated and saved for: ${storyTemplate.book_title} (User: ${userId})`,
        );
      })
      .catch((err) => {
        logger.error(
          `[Job FAILED] Media generation for: ${storyTemplate.book_title} (User: ${userId})`,
        );
        logger.error(err);
      });
  } catch (error) {
    logger.error(`Failed to initiate book saving: ${error.message}`);
    next(error);
  }
};

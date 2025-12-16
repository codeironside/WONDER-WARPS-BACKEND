import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
// Import the generator service
import StorybookGenerator from "../../../../../CORE/services/openai/generateBookTemplate/index.js";

const storybookGenerator = new StorybookGenerator();

export const saveTemplateAndGenerateMedia = (req, res, next) => {
  try {
    const userId = req.user._id;

    const { storyTemplate } = req.body;

    if (
      !storyTemplate ||
      !storyTemplate.book_title ||
      !storyTemplate.chapters
    ) {
      throw new ErrorHandler("Valid story template is required", 400);
    }

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

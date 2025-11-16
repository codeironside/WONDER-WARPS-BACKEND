import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
// Import the generator service
import StorybookGenerator from "../../../../../CORE/services/openai/generateBookTemplate/index.js";

// Instantiate the generator
const storybookGenerator = new StorybookGenerator();

/**
 * NEW: This is the "fire-and-forget" controller.
 * It replaces your old 'saveBookTemplate' function.
 */
export const saveTemplateAndGenerateMedia = (req, res, next) => {
  try {
    const userId = req.user.id;

    // **THE FIX IS HERE:**
    // We now expect 'storyTemplate' from the body, not 'story'.
    const { storyTemplate } = req.body;

    if (
      !storyTemplate ||
      !storyTemplate.book_title ||
      !storyTemplate.chapters
    ) {
      // Check for the new object structure
      throw new ErrorHandler("Valid story template is required", 400);
    }

    // --- 1. SEND IMMEDIATE RESPONSE ---
    // Send a 202 Accepted response *immediately*.
    sendResponse(
      res,
      202,
      "Book creation is in progress. It will appear in your account shortly.",
      { status: "PENDING", title: storyTemplate.book_title },
    );

    // --- 2. START BACKGROUND JOB ---
    // Call the slow media generation function *without* await
    // It runs in the background after the response is sent.
    storybookGenerator
      .generateMediaAndSave(storyTemplate, userId)
      .then(() => {
        // Job succeeded. Log it.
        logger.info(
          `[Job Success] Media generated and saved for: ${storyTemplate.book_title} (User: ${userId})`,
        );
      })
      .catch((err) => {
        // Job failed. Log the error.
        logger.error(
          `[Job FAILED] Media generation for: ${storyTemplate.book_title} (User: ${userId})`,
        );
        logger.error(err);
      });
  } catch (error) {
    // This only catches errors from the initial validation.
    logger.error(`Failed to initiate book saving: ${error.message}`);
    next(error);
  }
};

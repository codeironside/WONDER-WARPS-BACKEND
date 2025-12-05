import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import StorybookGenerator from "../../../../../CORE/services/openai/generateBookTemplate/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

// Instantiate the generator
const storybookGenerator = new StorybookGenerator();

export const generateTemplate = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      theme,
      name,
      photo_url,
      skin_tone,
      hair_type,
      hairstyle,
      hair_color,
      eye_color,
      facial_features,
      clothing,
      gender,
      age_min,
      age_max,
      prompt_message,
    } = req.body;

    console.log("Story template generation request:", req.body);

    if (!theme || !age_min || !age_max || !prompt_message || !gender) {
      throw new ErrorHandler("Required fields cannot be empty", 400);
    }

    const input = {
      theme: theme,
      name: name,
      photo_url: photo_url,
      skin_tone: skin_tone,
      hair_type: hair_type,
      hairstyle: hairstyle,
      hair_color: hair_color,
      eye_color: eye_color,
      facial_features: facial_features,
      clothing: clothing,
      gender: gender,
      age_min: parseInt(age_min),
      age_max: parseInt(age_max),
      prompt_message: prompt_message,
    };

    // MODIFIED: Call the NEW FAST function
    const storyTemplate = await storybookGenerator.generateStoryTemplate(input);

    logger.info(
      `Story template generated for user ${userId} with title "${storyTemplate.book_title}"`,
    );

    // MODIFIED: Send 200 OK with the template data.
    // Nothing is "created" in the DB yet.
    sendResponse(
      res,
      200,
      "Story template generated successfully",
      storyTemplate,
    );
  } catch (error) {
    console.log(error);
    logger.error(`Failed to generate story template: ${error.message}`);

    if (error instanceof ErrorHandler) {
      next(error);
    } else {
      next(
        new ErrorHandler(
          `Failed to generate story template: ${error.message}`,
          500,
        ),
      );
    }
  }
};

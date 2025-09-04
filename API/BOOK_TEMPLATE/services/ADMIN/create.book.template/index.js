import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import storybook from "../../../../../CORE/services/openai/generateBookTemplate/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

export const createBookTemplate = async (req, res, next) => {
  try {
    const userId = req.user.id;
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

    if (!theme || !age_min || !age_max || !prompt_message) {
      throw new ErrorHandler(`fields can not be empty`, 400);
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
      gender: gender, // Optional
      age_min: age_min,
      age_max: age_max,
      prompt_message: prompt_message,
    };
    storybook
      .generateStory(input)
      .then((story) => {
        logger.info(
          `book template created by user ${userId} with title "${story.book_title}"`,
        );
        sendResponse(res, 201, "book template created successfully", story);
      })
      .catch((error) => {
        console.error("Error:", error);
        throw new ErrorHandler("Failed to generate story.", 500);
      });
  } catch (error) {
    throw new ErrorHandler(
      `Failed to create book template: ${error.message}`,
      error.status || 500,
    );
  }
};

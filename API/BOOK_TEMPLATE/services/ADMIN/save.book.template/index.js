import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const saveBookTemplate = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { story } = req.body;
    console.log(story)
    if (!story || !story.book_title || !story.cover_image) {
      throw new ErrorHandler("Story data with book title is required", 400);
    }
    if (
      !story.cover_image ||
      !Array.isArray(story.cover_image) ||
      story.cover_image.length === 0
    ) {
      throw new ErrorHandler("Cover image is required", 400);
    }

    const bookTemplateData = {
      user_id: userId,
      book_title: story.book_title.trim(),
      skin_tone: story.skin_tone || null,
      hair_type: story.hair_type,
      hair_style: story.hair_style,
      hair_color: story.hair_color || null,
      eye_color: story.eye_color || null,
      clothing: story.clothing || null,
      gender: story.gender,
      age_min: story.age_min,
      age_max: story.age_max || null,
      cover_image: story.cover_image, // This is now required
      genre: story.genre || null,
      author: story.author || null,
      price: story.price ? parseFloat(story.price) : null,
      description: story.description || null,
      chapters: Array.isArray(story.chapters) ? story.chapters : [],
      keywords:
        Array.isArray(story.keywords) && story.keywords.length > 0
          ? story.keywords
          : null,
      is_personalizable: Boolean(story.is_personalizable),
      suggested_font: story.suggested_font,
    };

    const newTemplate = await BookTemplate.create(bookTemplateData);

    logger.info(`Book template created by user ${userId}: ${story.book_title}`);

    sendResponse(res, 201, "Book template created successfully", newTemplate);
  } catch (error) {
    logger.error(`Failed to save book template: ${error.message}`);
    next(error);
  }
};

import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const updateBookTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const {
      book_title,
      suggested_font,
      description,
      skin_tone,
      hair_type,
      hair_style,
      hair_color,
      eye_color,
      clothing,
      gender,
      age_min,
      age_max,
      cover_image,
      genre,
      author,
      price,
      keywords,
      is_personalizable,
      is_public,
    } = req.body;
    const updateData = {};

    if (book_title !== undefined) updateData.book_title = book_title;
    if (suggested_font !== undefined)
      updateData.suggested_font = suggested_font;
    if (description !== undefined) updateData.description = description;
    if (skin_tone !== undefined) updateData.skin_tone = skin_tone;
    if (hair_type !== undefined) updateData.hair_type = hair_type;
    if (hair_style !== undefined) updateData.hair_style = hair_style;
    if (hair_color !== undefined) updateData.hair_color = hair_color;
    if (eye_color !== undefined) updateData.eye_color = eye_color;
    if (clothing !== undefined) updateData.clothing = clothing;
    if (gender !== undefined) updateData.gender = gender;
    if (age_min !== undefined) updateData.age_min = age_min;
    if (age_max !== undefined) updateData.age_max = age_max;
    if (genre !== undefined) updateData.genre = genre;
    if (author !== undefined) updateData.author = author;
    if (price !== undefined) updateData.price = price;
    if (keywords !== undefined) updateData.keywords = keywords;
    if (is_personalizable !== undefined)
      updateData.is_personalizable = is_personalizable;
    if (is_public !== undefined) updateData.is_public = is_public;
    if (Object.keys(updateData).length === 0) {
      throw new ErrorHandler("No valid fields provided for update", 400);
    }
    const updatedTemplate = await BookTemplate.update(id, updateData);

    logger.info(`Book template ${id} updated by user ${userId}`);

    sendResponse(
      res,
      200,
      "Book template updated successfully",
      updatedTemplate,
    );
  } catch (error) {
    logger.error(`Failed to update book template: ${error.message}`);
    next(error);
  }
};

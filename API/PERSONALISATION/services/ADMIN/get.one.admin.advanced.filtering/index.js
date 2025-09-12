import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getAdminAllPersonalizedBooks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      is_paid,
      user_id,
      min_price,
      max_price,
      start_date,
      end_date,
      genre,
    } = req.query;

    const filters = {};
    if (is_paid !== undefined) filters.is_paid = is_paid === "true";
    if (user_id) filters.user_id = user_id;
    if (min_price !== undefined) filters.min_price = min_price;
    if (max_price !== undefined) filters.max_price = max_price;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (genre) filters.genre = genre;

    const result = await PersonalizedBook.findAllForAdminAdvanced({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters,
    });

    sendResponse(
      res,
      200,
      "All personalized books retrieved successfully for admin",
      result,
    );
  } catch (error) {
    logger.error(
      `Failed to get all personalized books for admin: ${error.message}`,
    );
    next(error);
  }
};

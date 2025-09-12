import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getPersonalizedBooksByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const result = await PersonalizedBook.findByGenre(genre, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    });

    sendResponse(
      res,
      200,
      "Personalized books by genre retrieved successfully",
      result,
    );
  } catch (error) {
    logger.error(`Failed to get personalized books by genre: ${error.message}`);
    next(error);
  }
};

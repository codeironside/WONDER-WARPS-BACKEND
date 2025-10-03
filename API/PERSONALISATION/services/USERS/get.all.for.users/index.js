import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";
export const getALLUserPersonalizedBooks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const result = await PersonalizedBook.findByUserPaginated(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    });

    sendResponse(res, 200, "Personalized books retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to get user personalized books: ${error.message}`);
    next(error);
  }
};

// Get all personalized books for admin dashboard

// Get personalized books by genre

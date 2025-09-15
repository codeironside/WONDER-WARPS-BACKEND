import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getAdminPersonalizedBooks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      is_paid,
      user_id,
    } = req.query;

    const filters = {};
    if (is_paid !== undefined) filters.is_paid = is_paid === "true";
    if (user_id) filters.user_id = user_id;

    const result = await PersonalizedBook.findAllForAdmin({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters,
    });

    sendResponse(
      res,
      200,
      "Admin personalized books retrieved successfully",
      result,
    );
  } catch (error) {
    logger.error(`Failed to get admin personalized books: ${error.message}`);
    next(error);
  }
};

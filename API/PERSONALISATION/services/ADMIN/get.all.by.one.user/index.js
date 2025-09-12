import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getAdminUserPersonalizedBooks = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      is_paid,
      min_price,
      max_price,
    } = req.query;

    const filters = {};
    if (is_paid !== undefined) filters.is_paid = is_paid === "true";
    if (min_price !== undefined) filters.min_price = min_price;
    if (max_price !== undefined) filters.max_price = max_price;

    const result = await PersonalizedBook.findAllByUserForAdmin(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters,
    });

    sendResponse(
      res,
      200,
      "User personalized books retrieved successfully for admin",
      result,
    );
  } catch (error) {
    logger.error(
      `Failed to get user personalized books for admin: ${error.message}`,
    );
    next(error);
  }
};

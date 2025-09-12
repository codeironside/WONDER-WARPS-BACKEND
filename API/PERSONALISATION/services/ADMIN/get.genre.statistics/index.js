import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getGenreStatistics = async (req, res, next) => {
  try {
    const stats = await PersonalizedBook.getGenreStats();

    sendResponse(res, 200, "Genre statistics retrieved successfully", stats);
  } catch (error) {
    logger.error(`Failed to get genre statistics: ${error.message}`);
    next(error);
  }
};

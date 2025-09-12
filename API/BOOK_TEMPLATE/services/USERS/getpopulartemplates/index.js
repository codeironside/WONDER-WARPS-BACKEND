import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getPopularTemplates = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      min_popularity = 5,
      genre,
      age_min,
      age_max,
    } = req.query;
    const filters = {
      is_public: true,
      popularity_score: { $gte: parseInt(min_popularity) },
    };

    if (genre) filters.genre = genre;
    if (age_min) filters.age_min = age_min;
    if (age_max) filters.age_max = age_max;
    const result = await BookTemplate.findAllPublicTemplates({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy: "popularity_score",
      sortOrder: "desc",
      filters,
    });

    sendResponse(res, 200, "Popular templates retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to retrieve popular templates: ${error.message}`);
    next(error);
  }
};

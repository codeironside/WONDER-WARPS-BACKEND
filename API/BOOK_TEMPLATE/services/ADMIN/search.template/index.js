import BookTemplate from "../../../model/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

export const searchBookTemplates = async (req, res, next) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      sortBy = "popularity_score",
      sortOrder = "desc",
      genre,
      keywords,
      is_personalizable,
    } = req.query;

    const filters = {};

    if (genre) {
      filters.genre = String(genre).trim();
    }

    if (typeof is_personalizable !== "undefined") {
      filters.is_personalizable = String(is_personalizable) === "true";
    }

    if (keywords) {
      let keywordArray = [];

      if (Array.isArray(keywords)) {
        keywordArray = keywords.map((k) => String(k));
      } else {
        keywordArray = String(keywords).split(",");
      }

      filters.keywords = keywordArray
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    }

    const result = await BookTemplate.searchPublicTemplates(q, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy: String(sortBy),
      sortOrder: String(sortOrder) === "asc" ? "asc" : "desc",
      filters,
    });

    sendResponse(res, 200, "Templates searched successfully", result);
  } catch (error) {
    logger.error(`Failed to search book templates: ${error.message}`);
    next(error);
  }
};

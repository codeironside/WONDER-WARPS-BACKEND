import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getPublicTemplates = async (req, res, next) => {
  try {
    const {
      page = "1",
      limit = "20",
      sortBy,
      sortOrder = "desc",
      genre,
      age_min,
      age_max,
      is_personalizable, // 👈 match your query param name
    } = req.query;

    console.log("RAW QUERY:", req.query);

    // default true if not provided
    const isPersonalizable =
      typeof is_personalizable === "string"
        ? is_personalizable === "true"
        : true;

    // 👇 handle keywords AND keywords[]
    const rawKeywords = req.query.keywords ?? req.query["keywords[]"];

    let keywordArray = [];
    if (Array.isArray(rawKeywords)) {
      keywordArray = rawKeywords.map((k) => String(k).trim()).filter(Boolean);
    } else if (typeof rawKeywords === "string") {
      keywordArray = rawKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }

    const filters = {
      is_personalizable: isPersonalizable,
    };

    if (typeof genre === "string" && genre.trim()) {
      filters.genre = genre.trim();
    }

    if (typeof age_min === "string" && age_min.trim()) {
      filters.age_min = age_min.trim();
    }

    if (typeof age_max === "string" && age_max.trim()) {
      filters.age_max = age_max.trim();
    }

    if (keywordArray.length > 0) {
      filters.keywords = keywordArray;
    }

    console.log("FILTERS SENT TO MODEL:", filters);

    const result = await BookTemplate.findAllPublicTemplates({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy: sortBy || "createdAt",
      sortOrder: sortOrder === "asc" ? "asc" : "desc",
      filters,
    });

    sendResponse(res, 200, "Public templates retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to get public templates: ${error.message}`);
    next(error);
  }
};

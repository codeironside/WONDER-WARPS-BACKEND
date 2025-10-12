import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getPublicTemplates = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder = "desc",
      genre,
      age_min,
      age_max,
      personalizable,
      keywords,
    } = req.query;
    const isPersonalizable = personalizable
      ? personalizable === "true"
      : true;
    console.log(isPersonalizable)

    let keywordArray = [];
    if (keywords) {
      keywordArray = keywords.split(",").map((k) => k.trim());
    }

    const result = await BookTemplate.findAllPublicTemplates({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters: {
        genre,
        age_min,
        age_max,
        is_personalizable: isPersonalizable,
        keywords: keywordArray.length > 0 ? keywordArray : undefined,
      },
    });

    sendResponse(res, 200, "Public templates retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to get public templates: ${error.message}`);
    next(error);
  }
};

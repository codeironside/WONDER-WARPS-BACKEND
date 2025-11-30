import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const getBlogBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const result = await Blog.findBySlug(slug);

    sendResponse(res, 200, "Blog post retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to retrieve blog by slug: ${error.message}`);
    next(error);
  }
};

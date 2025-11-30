import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const getAllBlogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "published_at",
      sortOrder = "desc",
      category,
      tag,
      search,
      status, // 'published', 'draft', or 'all'
    } = req.query;

    const result = await Blog.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      category,
      tag,
      search,
      status,
    });

    sendResponse(res, 200, "Blog posts retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to retrieve blogs: ${error.message}`);
    next(error);
  }
};

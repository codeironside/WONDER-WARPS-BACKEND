import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const getBlogCategories = async (req, res, next) => {
  try {
    const result = await Blog.getCategories();

    sendResponse(res, 200, "Blog categories retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to get blog categories: ${error.message}`);
    next(error);
  }
};

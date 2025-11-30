import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const getBlogById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await Blog.findById(id);

    sendResponse(res, 200, "Blog post details retrieved successfully", result);
  } catch (error) {
    logger.error(`Failed to retrieve blog by ID: ${error.message}`);
    next(error);
  }
};

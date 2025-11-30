import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const deleteBlog = async (req, res, next) => {
  try {
    const { id } = req.params;

    await Blog.delete(id);

    sendResponse(res, 200, "Blog post deleted successfully", null);
  } catch (error) {
    logger.error(`Failed to delete blog: ${error.message}`);
    next(error);
  }
};

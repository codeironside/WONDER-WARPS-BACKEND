import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const updateBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const result = await Blog.update(id, updateData);

    sendResponse(res, 200, "Blog post updated successfully", result);
  } catch (error) {
    logger.error(`Failed to update blog: ${error.message}`);
    next(error);
  }
};

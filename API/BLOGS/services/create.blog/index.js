import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";
export const createBlog = async (req, res, next) => {
  try {
    const blogData = req.body;
    if (req.user) {
      blogData.author = {
        ...blogData.author,
        user_id: req.user._id,
      };
    }

    const result = await Blog.create(blogData);

    sendResponse(res, 201, "Blog post created successfully", result);
  } catch (error) {
    logger.error(`Failed to create blog: ${error.message}`);
    next(error);
  }
};

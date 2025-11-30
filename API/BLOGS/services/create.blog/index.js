import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";
export const createBlog = async (req, res, next) => {
  try {
    const blogData = req.body;

    if (req.user) {
      blogData.author = {
        name: `${req.user.firstname} ${req.user.lastname}`,
        role: "Admin",
        avatar: req.user.profilePicture || null,
        // Use .toString() to get the clean 24-char hex string
        user_id: req.user._id.toString(),
      };
    }

    const result = await Blog.create(blogData);

    sendResponse(res, 201, "Blog post created successfully", result);
  } catch (error) {
    logger.error(`Failed to create blog: ${error.message}`);
    next(error);
  }
};

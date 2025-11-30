import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import Blog from "../../model/index.js";

export const uploadBlogMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ErrorHandler("No media file provided", 400);
    }

    const result = await Blog.uploadInlineMedia(req.file);

    sendResponse(res, 200, "Media uploaded successfully", result);
  } catch (error) {
    logger.error(`Failed to upload blog media: ${error.message}`);
    next(error);
  }
};

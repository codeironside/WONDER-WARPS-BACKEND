import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getPublicTemplateWithChapters = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ErrorHandler("Template ID is required", 400);
    }

    const template = await BookTemplate.findPublicByIdWithChapters(id);

    sendResponse(res, 200, "Public template retrieved successfully", template);
  } catch (error) {
    logger.error(`Failed to get public template: ${error.message}`);
    next(error);
  }
};

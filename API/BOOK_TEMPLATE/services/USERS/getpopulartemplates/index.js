import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const incrementTemplatePopularity = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ErrorHandler("Template ID is required", 400);
    }
    const updatedTemplate = await BookTemplate.incrementPopularity(id);

    sendResponse(
      res,
      200,
      "Template popularity updated successfully",
      updatedTemplate,
    );
  } catch (error) {
    logger.error(`Failed to update template popularity: ${error.message}`);
    next(error);
  }
};

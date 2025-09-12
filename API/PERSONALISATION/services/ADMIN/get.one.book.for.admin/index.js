import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getAdminPersonalizedBook = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { include_chapters = "true" } = req.query;

    const book = await PersonalizedBook.findOneForAdmin(id, {
      includeChapters: include_chapters === "true",
    });

    sendResponse(
      res,
      200,
      "Personalized book retrieved successfully for admin",
      book,
    );
  } catch (error) {
    logger.error(`Failed to get personalized book for admin: ${error.message}`);
    next(error);
  }
};

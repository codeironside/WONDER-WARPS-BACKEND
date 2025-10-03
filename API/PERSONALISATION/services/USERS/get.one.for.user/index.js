import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getUserPersonalizedBook = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.body;
    if (!id) {
      throw new ErrorHandler("Personalized book ID is required", 400);
    }

    const book = await PersonalizedBook.findByIdForUser(id, userId);

    sendResponse(res, 200, "Personalized book retrieved successfully", book);
  } catch (error) {
    logger.error(`Failed to get personalized book: ${error.message}`);
    next(error);
  }
};

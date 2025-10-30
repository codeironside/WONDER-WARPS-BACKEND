import ErrorHandler from "@/Error";
import {
  sendResponse
} from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const updateDedicationMessage = async (req, res, next) => {
  try {
    const bodyKeys = Object.keys(req.body);
    if (bodyKeys.length !== 1 || bodyKeys[0] !== "dedication_message") {
      throw new ErrorHandler(
        "Invalid request body. Only the 'dedication_message' field can be provided.",
        400,
      );
    }

    const {
      bookId
    } = req.params;
    const {
      dedication_message
    } = req.body;
    const userId = req.user.id;

    if (!bookId) {
      throw new ErrorHandler("Book ID is required", 400);
    }

    if (!dedication_message || dedication_message.trim().length === 0) {
      throw new ErrorHandler("Dedication message cannot be empty", 400);
    }

    if (dedication_message.length > 1000) {
      throw new ErrorHandler(
        "Dedication message must be less than 1000 characters",
        400,
      );
    }

    const updatedBook = await PersonalizedBook.updateDedicationMessage(
      bookId,
      userId,
      dedication_message.trim(),
    );

    const book = {
      id: updatedBook._id,
      child_name: updatedBook.child_name,
      dedication_message: updatedBook.dedication_message,
      is_paid: updatedBook.is_paid,
      updatedAt: updatedBook.updatedAt,
    };

    sendResponse(res, 200, "Dedication message updated successfully", book);
  } catch (error) {
    next(error);
  }
};
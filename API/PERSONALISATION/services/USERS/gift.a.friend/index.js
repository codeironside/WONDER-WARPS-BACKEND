import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const sendGift = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const { recipient_email, recipient_name, gift_message, sender_name } =
      req.body;
    const userId = req.user._id;

    const updatedBook = await PersonalizedBook.initiateGift(bookId, userId, {
      recipient_email,
      recipient_name,
      gift_message,
      sender_name,
    });

    sendResponse(res, 200, "Gift sent successfully!", updatedBook);
  } catch (error) {
    next(error);
  }
};

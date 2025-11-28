import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const redeemGift = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id; // User must be logged in to claim

    const claimedBook = await PersonalizedBook.claimGift(token, userId);

    sendResponse(
      res,
      200,
      "Gift claimed successfully! It is now in your library.",
      claimedBook,
    );
  } catch (error) {
    next(error);
  }
};

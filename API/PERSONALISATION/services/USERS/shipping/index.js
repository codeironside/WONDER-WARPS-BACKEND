import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const saveShippingDetails = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const shippingData = req.body;

    if (!req.user || !req.user._id) {
      throw new ErrorHandler("User not authenticated", 401);
    }

    const result = await PersonalizedBook.saveShippingDetails(
      bookId,
      req.user._id,
      shippingData,
    );

    sendResponse(res, 200, "Shipping details saved successfully", result);
  } catch (error) {
    logger.error(`Failed to save shipping details: ${error.message}`);
    next(error);
  }
};

import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import PersonalizedBook from "../../../model/index.js";

export const getPaymentStatistics = async (req, res, next) => {
  try {
    const stats = await PersonalizedBook.getPaymentStats();

    sendResponse(res, 200, "Payment statistics retrieved successfully", stats);
  } catch (error) {
    logger.error(`Failed to get payment statistics: ${error.message}`);
    next(error);
  }
};

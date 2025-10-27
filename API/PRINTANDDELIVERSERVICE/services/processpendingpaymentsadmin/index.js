import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const processPendingPayments = async (req, res, next) => {
  try {
    const printService = new PrintOrderService();
    const result = await printService.processPendingPayments();

    sendResponse(res, 200, "Pending payments processing completed", result);
  } catch (error) {
    next(error);
  }
};

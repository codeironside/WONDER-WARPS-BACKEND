import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const checkPaymentStatus = async (req, res, next) => {
  try {
    const { session_id } = req.query;
    const userId = req.user._id;

    if (!session_id) {
      throw new ErrorHandler("Session ID is required", 400);
    }

    const printService = new PrintOrderService();
    const result = await printService.checkPaymentStatus(session_id, userId);

    sendResponse(res, 200, "Payment status checked successfully", result);
  } catch (error) {
    next(error);
  }
};

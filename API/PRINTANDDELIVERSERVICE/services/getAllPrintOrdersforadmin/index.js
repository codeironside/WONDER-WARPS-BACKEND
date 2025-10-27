import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getAllPrintOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, payment_status, user_id } = req.query;

    const printService = new PrintOrderService();
    const result = await printService.getAllPrintOrders({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      payment_status,
      user_id,
    });

    sendResponse(res, 200, "All print orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

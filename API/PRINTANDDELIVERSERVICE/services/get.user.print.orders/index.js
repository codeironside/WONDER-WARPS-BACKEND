import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const getUserPrintOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status, payment_status } = req.query;

    const printService = new PrintOrderService();
    const result = await printService.getUserPrintOrders(userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      payment_status,
    });

    sendResponse(res, 200, "User print orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

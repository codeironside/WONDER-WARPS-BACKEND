import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
export const syncOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const printService = new PrintOrderService();
    const result = await printService.getPrintOrderStatus(orderId);

    sendResponse(res, 200, "Order status synced with Lulu", result);
  } catch (error) {
    next(error);
  }
};

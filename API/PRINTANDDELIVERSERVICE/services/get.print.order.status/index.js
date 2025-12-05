import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const getPrintOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const printService = new PrintOrderService();
    const result = await printService.getPrintOrderStatus(orderId, userId);

    sendResponse(res, 200, "Print order status retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

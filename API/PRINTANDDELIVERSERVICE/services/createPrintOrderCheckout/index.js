import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const createPrintOrderCheckout = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const printService = new PrintOrderService();
    const result = await printService.createPrintOrderCheckout(orderId, userId);

    sendResponse(res, 200, "Checkout session created successfully", result);
  } catch (error) {
    next(error);
  }
};

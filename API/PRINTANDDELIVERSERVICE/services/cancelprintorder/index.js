import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const cancelPrintOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const printService = new PrintOrderService();
    const result = await printService.cancelPrintOrder(orderId, userId, false);

    sendResponse(res, 200, "Print order cancelled successfully", {
      printOrder: result,
    });
  } catch (error) {
    next(error);
  }
};

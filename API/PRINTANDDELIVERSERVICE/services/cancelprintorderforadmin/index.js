import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const cancelPrintOrderAdmin = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const printService = new PrintOrderService();
    const result = await printService.cancelPrintOrder(orderId, null, true);

    sendResponse(res, 200, "Print order cancelled by admin", {
      printOrder: result,
    });
  } catch (error) {
    next(error);
  }
};

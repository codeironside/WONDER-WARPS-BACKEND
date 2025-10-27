import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
export const getPrintOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const printService = new PrintOrderService();
    const result = await printService.getPrintOrderStatus(orderId);

    sendResponse(
      res,
      200,
      "Print order details retrieved successfully",
      result,
    );
  } catch (error) {
    next(error);
  }
};

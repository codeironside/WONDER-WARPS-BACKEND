import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const createPrintOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderData = req.body;

    const printService = new PrintOrderService();
    const result = await printService.createPrintOrderWithCost(
      userId,
      orderData,
    );

    sendResponse(res, 201, "Print order created with cost calculation", result);
  } catch (error) {
    next(error);
  }
};

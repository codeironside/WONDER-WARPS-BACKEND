import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getShippingOptions = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const printService = new PrintOrderService();
    const result = await printService.getShippingOptions(orderId, userId);

    sendResponse(res, 200, "Shipping options retrieved", {
      shippingOptions: result,
    });
  } catch (error) {
    next(error);
  }
};

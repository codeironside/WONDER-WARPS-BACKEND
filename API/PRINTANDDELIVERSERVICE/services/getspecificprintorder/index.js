import PrintOrder from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const getPrintOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const printOrder = await PrintOrder.findByIdForUser(orderId, userId);
    sendResponse(res, 200, "order fetched successfully", { printOrder });
  } catch (error) {
    next(error);
  }
};

import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getPrintOrderStats = async (req, res, next) => {
  try {
    const printService = new PrintOrderService();
    const result = await printService.getPrintOrderStats();

    sendResponse(res, 200, "Print order statistics retrieved", result);
  } catch (error) {
    next(error);
  }
};

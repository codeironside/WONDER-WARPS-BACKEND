import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getAvailableServices = async (req, res, next) => {
  try {
    const { category, color, binding } = req.query;

    const services = await PrintServiceOptions.findAllActive({
      category,
      color,
      binding,
    });

    sendResponse(res, 200, "Available services retrieved successfully", {
      services,
    });
  } catch (error) {
    next(error);
  }
};

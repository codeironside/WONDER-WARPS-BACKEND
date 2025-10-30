import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getPrintServiceOptions = async (req, res, next) => {
  try {
    const { category, color, binding } = req.query;

    const filters = {};
    if (category) filters.category = category;
    if (color) filters.color = color;
    if (binding) filters.binding = binding;

    const services = await PrintServiceOptions.findAllActiveForAdmin(filters);

    sendResponse(res, 200, "Print service options retrieved successfully", {
      services,
      count: services.length,
      filters,
    });
  } catch (error) {
    next(error);
  }
};

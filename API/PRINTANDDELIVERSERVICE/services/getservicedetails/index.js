import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getServiceDetails = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    const service = await PrintServiceOptions.findById(serviceId);

    sendResponse(res, 200, "Service details retrieved successfully", {
      service,
    });
  } catch (error) {
    next(error);
  }
};

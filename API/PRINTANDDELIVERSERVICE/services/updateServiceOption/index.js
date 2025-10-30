import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const updateServiceOption = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const updateData = req.body;

    const updatedService = await PrintServiceOptions.updateService(
      serviceId,
      updateData,
    );

    sendResponse(res, 200, "Service option updated successfully", {
      service: updatedService,
    });
  } catch (error) {
    next(error);
  }
};

import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
export const updateServiceOption = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const updateData = req.body;

    const service = await PrintServiceOptions.findById(serviceId);
    if (!service) {
      throw new ErrorHandler("Service option not found", 404);
    }

    // Update logic would go here (you'd need to add an update method to your model)
    // const updatedService = await PrintServiceOptions.updateService(serviceId, updateData);

    sendResponse(res, 200, "Service option updated successfully", {
      service: updatedService,
    });
  } catch (error) {
    next(error);
  }
};

import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const createServiceOption = async (req, res, next) => {
  try {
    const serviceData = req.body;

    const service = await PrintServiceOptions.createService(serviceData);

    sendResponse(res, 201, "Print service option created successfully", {
      service,
      pod_package_id: service.pod_package_id,
    });
  } catch (error) {
    next(error);
  }
};

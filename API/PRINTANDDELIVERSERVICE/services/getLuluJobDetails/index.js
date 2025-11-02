import LuluAPIService from "../../../../CORE/services/luluapiservice/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getLuluJobDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ErrorHandler("A Print Job ID is required.", 400);
    }
    const luluService = new LuluAPIService();
    const printJob = await luluService.getPrintJob(id);
    sendResponse(
      res,
      200,
      "Print job details retrieved successfully",
      printJob,
    );
  } catch (error) {
    next(error);
  }
};

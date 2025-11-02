import LuluAPIService from "../../../../CORE/services/luluapiservice/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getLuluJobCosts = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ErrorHandler("A Print Job ID is required.", 400);
    }
    const luluService = new LuluAPIService();
    const costs = await luluService.getPrintJobCosts(id);
    sendResponse(res, 200, "Print job costs retrieved successfully", costs);
  } catch (error) {
    next(error);
  }
};

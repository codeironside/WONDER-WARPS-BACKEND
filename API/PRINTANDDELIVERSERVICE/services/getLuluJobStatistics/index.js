import LuluAPIService from "../../../../CORE/services/luluapiservice/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
export const getLuluJobStatistics = async (req, res, next) => {
  try {
    const luluService = new LuluAPIService();
    const statistics = await luluService.getPrintJobStatistics(req.query);
    sendResponse(
      res,
      200,
      "Print job statistics retrieved successfully",
      statistics,
    );
  } catch (error) {
    next(error);
  }
};

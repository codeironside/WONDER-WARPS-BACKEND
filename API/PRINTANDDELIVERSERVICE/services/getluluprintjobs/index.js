import LuluAPIService from "../../../../CORE/services/luluapiservice/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
const luluService = new LuluAPIService();
export const listAllPrintJobs = async (req, res) => {
  try {
    let filters = {};
    filters = req.query;
    const allPrintJobs = await luluService.getAllPrintJobs(filters);

    logger.info("Successfully retrieved all print jobs", {
      totalCount: allPrintJobs.length,
      filters,
    });
    let response = {
      data: allPrintJobs,
      count: allPrintJobs.length,
      filters,
    };
    sendResponse(res, 200, "Print job retrieved successfully", response);
  } catch (error) {
    console.log(error);
    logger.error("Failed to list print jobs", {
      error: error.message,
      filters,
    });
  }
};

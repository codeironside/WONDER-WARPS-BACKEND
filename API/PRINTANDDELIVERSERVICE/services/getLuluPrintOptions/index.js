import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const getLuluPrintOptions = async (req, res, next) => {
  try {
    const mappings = PrintServiceOptions.getLuluOptionMappings();

    sendResponse(res, 200, "Lulu print options retrieved successfully", {
      options: mappings,
      total_categories: Object.keys(mappings).length,
      total_combinations: calculateTotalCombinations(mappings),
    });
  } catch (error) {
    next(error);
  }
};

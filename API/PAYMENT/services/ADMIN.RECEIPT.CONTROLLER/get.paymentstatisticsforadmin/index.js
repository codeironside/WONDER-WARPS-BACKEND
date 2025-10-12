import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getPayementPlatformStats = async (req, res, next) => {
  try {
    const { timeRange = "all" } = req.query;

    const stats = await Receipt.getPlatformStatistics(timeRange);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

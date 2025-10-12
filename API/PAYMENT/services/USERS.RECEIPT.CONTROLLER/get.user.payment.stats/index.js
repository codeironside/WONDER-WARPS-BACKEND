import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const stats = await Receipt.getUserStatistics(userId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

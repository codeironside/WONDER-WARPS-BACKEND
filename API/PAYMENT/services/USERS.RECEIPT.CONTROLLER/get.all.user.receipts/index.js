import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getALLUserReceipts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 10,
      sortBy = "paid_at",
      sortOrder = "desc",
      startDate,
      endDate,
      refunded,
    } = req.query;

    const receipts = await Receipt.findAllForUser(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      startDate,
      endDate,
      refunded,
    });

    res.status(200).json({
      success: true,
      data: receipts,
    });
  } catch (error) {
    next(error);
  }
};

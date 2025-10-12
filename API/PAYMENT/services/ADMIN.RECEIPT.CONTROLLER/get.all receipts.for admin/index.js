import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getAllReceiptsForAdmin = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "paid_at",
      sortOrder = "desc",
      user_id,
      min_amount,
      max_amount,
      start_date,
      end_date,
      genre,
      refunded,
    } = req.query;

    const receipts = await Receipt.findAllForAdmin({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters: {
        user_id,
        min_amount: min_amount ? parseFloat(min_amount) : undefined,
        max_amount: max_amount ? parseFloat(max_amount) : undefined,
        start_date,
        end_date,
        genre,
        refunded,
      },
    });

    res.status(200).json({
      success: true,
      data: receipts,
    });
  } catch (error) {
    next(error);
  }
};

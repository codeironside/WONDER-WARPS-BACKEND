import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const processRefundAmin = async (req, res, next) => {
  try {
    const { receiptId } = req.params;
    const { amount, reason = "requested_by_customer" } = req.body;

    if (!receiptId) {
      throw new ErrorHandler("Receipt ID is required", 400);
    }

    const result = await Receipt.processRefund(receiptId, amount, reason);

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

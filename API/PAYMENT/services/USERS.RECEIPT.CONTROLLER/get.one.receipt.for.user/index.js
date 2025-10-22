import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getOneUserReceipt = async (req, res, next) => {
  try {
    const { receiptId } = req.params;
    const userId = req.user._id;

    if (!receiptId) {
      throw new ErrorHandler("Receipt ID is required", 400);
    }

    const receipt = await Receipt.findOneForUser(receiptId, userId);

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

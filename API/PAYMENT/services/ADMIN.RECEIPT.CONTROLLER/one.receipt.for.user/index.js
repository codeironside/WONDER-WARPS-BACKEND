import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getReceiptForUserByAdmin = async (req, res, next) => {
  try {
    const { userId, receiptId } = req.params;

    if (!userId || !receiptId) {
      throw new ErrorHandler("User ID and Receipt ID are required", 400);
    }

    const receipt = await Receipt.findOneForUserAdmin(receiptId, userId);

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

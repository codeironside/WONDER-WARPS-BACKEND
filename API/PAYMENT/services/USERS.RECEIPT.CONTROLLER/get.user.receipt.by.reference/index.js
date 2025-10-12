import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getUserReceiptByReference = async (req, res, next) => {
  try {
    const { referenceCode } = req.params;
    const userId = req.user._id;

    if (!referenceCode) {
      throw new ErrorHandler("Reference code is required", 400);
    }

    const receipt = await Receipt.findByReferenceCode(referenceCode, userId);

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

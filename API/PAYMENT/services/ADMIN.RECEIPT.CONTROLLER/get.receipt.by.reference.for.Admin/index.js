import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const getReceiptByReferenceAdmin = async (req, res, next) => {
  try {
    const { referenceCode } = req.params;

    if (!referenceCode) {
      throw new ErrorHandler("Reference code is required", 400);
    }

    const receipt = await Receipt.findByReferenceCodeAdmin(referenceCode);

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const confirmPayment = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw new ErrorHandler("session id are required", 400);
    }
    const result = await PersonalizedBook.confirmPaymentWithSession(req,sessionId);

    res.status(200).json({
      success: true,
      message: "Payment completed successfully",
      data: {
        book: result.book,
        receipt: result.receipt,
        payment: result.payment,
      },
    });
  } catch (error) {
    next(error);
  }
};

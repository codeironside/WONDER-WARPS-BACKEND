import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import stripeService from "../../../../CORE/services/stripe/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export const confirmPayment = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const { payment_intent_id } = req.body;
    const user = req.user;

    if (!bookId || !payment_intent_id) {
      throw new ErrorHandler("Book ID and payment intent ID are required", 400);
    }

    const book = await PersonalizedBook.findByIdForUser(bookId, user._id);
    if (!book) {
      throw new ErrorHandler("Book not found or access denied", 404);
    }

    const result = await PersonalizedBook.confirmPayment(
      bookId,
      payment_intent_id,
    );

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

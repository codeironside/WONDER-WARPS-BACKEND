import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import stripeService from "../../../../CORE/services/stripe/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export const getPaymentStatus = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const user = req.user;

    const book = await PersonalizedBook.findByIdForUser(bookId, user._id);
    if (!book) {
      throw new ErrorHandler("Book not found", 404);
    }

    let paymentStatus = {
      is_paid: book.is_paid,
      payment_id: book.payment_id,
      payment_date: book.payment_date,
    };

    // If paid, get receipt details
    if (book.is_paid && book.payment_id) {
      try {
        const Receipt = await import("../../models/receipt.model.js");
        const receipt = await Receipt.default.findByReferenceCode(
          book.payment_id,
          user._id,
        );
        paymentStatus.receipt = receipt;
      } catch (error) {
        logger.warn("Receipt not found for paid book", {
          bookId,
          paymentId: book.payment_id,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: paymentStatus,
    });
  } catch (error) {
    next(error);
  }
};

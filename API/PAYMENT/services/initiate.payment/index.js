import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";

export const initiatePayment = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const user = req.user;

    if (!bookId) {
      throw new ErrorHandler("Book ID is required", 400);
    }

    const paymentData = await PersonalizedBook.initiatePayment(bookId, {
      email: user.email,
      name: `${user.firstname} ${user.lastname}`,
      userId: user._id,
    });

    res.status(200).json({
      success: true,
      message: "Payment initiated successfully",
      data: paymentData,
    });
  } catch (error) {
    next(error);
  }
};

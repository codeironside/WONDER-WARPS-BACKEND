import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import stripeService from "../../../../CORE/services/stripe/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export const handleStripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      throw new ErrorHandler("Stripe signature header is missing", 400);
    }

    const event = await stripeService.handleWebhook(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    await PersonalizedBook.handleStripeWebhook(event);

    res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    next(error);
  }
};

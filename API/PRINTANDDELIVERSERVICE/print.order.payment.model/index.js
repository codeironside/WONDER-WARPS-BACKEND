import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../CORE/utils/logger/index.js";

const printOrderPaymentSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
    },
    print_order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PrintOrder",
      required: true,
    },
    personalized_book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalizedBook",
      required: true,
    },
    checkout_session_id: {
      type: String,
      required: true,
    },
    payment_intent_id: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      default: "pending",
    },
    payment_method: {
      type: String,
    },
    receipt_url: {
      type: String,
    },
    callback_processed: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

printOrderPaymentSchema.index({ user_id: 1 });
printOrderPaymentSchema.index({ print_order_id: 1 });
printOrderPaymentSchema.index({ checkout_session_id: 1 }, { unique: true });
printOrderPaymentSchema.index({ payment_intent_id: 1 });
printOrderPaymentSchema.index({ status: 1 });
printOrderPaymentSchema.index({ callback_processed: 1 });

const validationSchema = Joi.object({
  user_id: Joi.string().required(),
  print_order_id: Joi.string().required(),
  personalized_book_id: Joi.string().required(),
  checkout_session_id: Joi.string().required(),
  payment_intent_id: Joi.string().optional(),
  amount: Joi.number().precision(2).positive().required(),
  currency: Joi.string().length(3).default("usd"),
  status: Joi.string()
    .valid("pending", "succeeded", "failed", "refunded")
    .default("pending"),
  payment_method: Joi.string().optional(),
  receipt_url: Joi.string().uri().optional(),
  callback_processed: Joi.boolean().default(false),
});

class PrintOrderPayment {
  static validationSchema = validationSchema;

  static async createPendingPayment(paymentData) {
    try {
      const { error, value: validatedData } = this.validationSchema.validate(
        paymentData,
        {
          abortEarly: false,
          stripUnknown: true,
        },
      );

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const payment = new PrintOrderPaymentModel(validatedData);
      await payment.save();

      logger.info("Print order payment record created (pending)", {
        paymentId: payment._id,
        checkoutSessionId: validatedData.checkout_session_id,
        printOrderId: validatedData.print_order_id,
      });

      return payment.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create payment record: ${error.message}`,
        500,
      );
    }
  }

  static async confirmPayment(checkoutSessionId, paymentData) {
    try {
      const updatedPayment = await PrintOrderPaymentModel.findOneAndUpdate(
        { checkout_session_id: checkoutSessionId },
        {
          status: "succeeded",
          payment_intent_id: paymentData.payment_intent_id,
          payment_method: paymentData.payment_method,
          receipt_url: paymentData.receipt_url,
          callback_processed: true,
          metadata: paymentData.metadata,
        },
        { new: true },
      ).exec();

      if (!updatedPayment) {
        throw new ErrorHandler("Payment record not found", 404);
      }

      logger.info("Print order payment confirmed via callback", {
        checkoutSessionId,
        paymentId: updatedPayment._id,
      });

      return updatedPayment.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to confirm payment", 500);
    }
  }

  static async markAsFailed(checkoutSessionId) {
    try {
      const updatedPayment = await PrintOrderPaymentModel.findOneAndUpdate(
        { checkout_session_id: checkoutSessionId },
        {
          status: "failed",
          callback_processed: true,
        },
        { new: true },
      ).exec();

      if (!updatedPayment) {
        throw new ErrorHandler("Payment record not found", 404);
      }

      return updatedPayment.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to mark payment as failed", 500);
    }
  }

  static async findByCheckoutSession(checkoutSessionId) {
    try {
      const payment = await PrintOrderPaymentModel.findOne({
        checkout_session_id: checkoutSessionId,
      }).exec();

      return payment ? payment.toObject() : null;
    } catch (error) {
      throw new ErrorHandler("Failed to find payment by checkout session", 500);
    }
  }

  static async findByPrintOrder(printOrderId) {
    try {
      const payment = await PrintOrderPaymentModel.findOne({
        print_order_id: printOrderId,
      }).exec();

      return payment ? payment.toObject() : null;
    } catch (error) {
      throw new ErrorHandler("Failed to find payment by print order ID", 500);
    }
  }

  static async getPendingPayments() {
    try {
      const payments = await PrintOrderPaymentModel.find({
        status: "pending",
        callback_processed: false,
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      }).exec();

      return payments.map((payment) => payment.toObject());
    } catch (error) {
      throw new ErrorHandler("Failed to fetch pending payments", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

const PrintOrderPaymentModel = mongoose.model(
  "PrintOrderPayment",
  printOrderPaymentSchema,
);
export default PrintOrderPayment;

import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import LuluAPIService from "../../../CORE/services/luluapiservice/index.js";

const printOrderSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
    },
    personalized_book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalizedBook",
      required: true,
    },
    service_option_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PrintServiceOptions",
      required: true,
    },
    lulu_print_job_id: {
      type: String,
      sparse: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "created",
        "unpaid",
        "payment_in_progress",
        "production_delayed",
        "production_ready",
        "in_production",
        "shipped",
        "rejected",
        "canceled",
        "error",
      ],
      default: "in_production",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    shipping_address: {
      name: { type: String, required: true },
      street1: { type: String, required: true },
      street2: { type: String, default: "" },
      city: { type: String, required: true },
      state_code: { type: String, required: true },
      country_code: { type: String, required: true },
      postcode: { type: String, required: true },
      phone_number: { type: String, required: true },
    },
    shipping_level: {
      type: String,
      enum: ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"],
      required: true,
    },
    contact_email: {
      type: String,
      required: true,
    },
    external_id: {
      type: String,
    },
    production_delay: {
      type: Number,
      default: 60,
      min: 60,
      max: 2880,
    },
    cost_breakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    tracking_info: {
      tracking_id: String,
      tracking_urls: [String],
      carrier_name: String,
      shipped_at: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

printOrderSchema.index({ user_id: 1, status: 1 });
printOrderSchema.index({ personalized_book_id: 1 });
printOrderSchema.index({ lulu_print_job_id: 1 });
printOrderSchema.index({ created_at: -1 });
const validationSchema = Joi.object({
  personalized_book_id: Joi.string().required(),
  service_option_id: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(1000).required(),
  shipping_address: Joi.object({
    name: Joi.string().required(),
    street1: Joi.string().required(),
    street2: Joi.string().allow("").optional(),
    city: Joi.string().required(),
    state_code: Joi.string().required(),
    country_code: Joi.string().length(2).required(),
    postcode: Joi.string().required(),
    phone_number: Joi.string().required(),
  }).required(),
  shipping_level: Joi.string()
    .valid("MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS")
    .required(),
  contact_email: Joi.string().email().required(),
  external_id: Joi.string().optional(),
  production_delay: Joi.number().integer().min(60).max(2880).optional(),
});

class PrintOrder {
  static validationSchema = validationSchema;

  static async createOrder(userId, orderData) {
    try {
      const { error, value: validatedData } = this.validationSchema.validate(
        orderData,
        {
          abortEarly: false,
          stripUnknown: true,
        },
      );

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const printOrder = new PrintOrderModel({
        user_id: userId,
        ...validatedData,
        status: "in_production",
      });

      await printOrder.save();

      logger.info("Print order created successfully", {
        orderId: printOrder._id,
        userId,
        bookId: validatedData.personalized_book_id,
      });

      return printOrder.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create print order: ${error.message}`,
        500,
      );
    }
  }

  static async findById(orderId) {
    try {
      const order = await PrintOrderModel.findById(orderId)
        .populate("service_option_id")
        .populate("personalized_book_id")
        .exec();

      return order ? order.toObject() : null;
    } catch (error) {
      throw new ErrorHandler("Failed to find print order by ID", 500);
    }
  }

  static async findByUser(userId, options = {}) {
    try {
      const { page = 1, limit = 10, status, payment_status } = options;

      const query = { user_id: userId };
      if (status) {
        query.status = status;
      }
      if (payment_status) {
        query.payment_status = payment_status; // Add this line
      }

      const skip = (page - 1) * limit;

      const orders = await PrintOrderModel.find(query)
        .populate(
          "service_option_id",
          "name category pod_package_id base_price",
        )
        .populate(
          "personalized_book_id",
          "child_name personalized_content.book_title is_paid",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PrintOrderModel.countDocuments(query);

      return {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to fetch user print orders", 500);
    }
  }

  static async findByIdForUser(orderId, userId) {
    try {
      const order = await PrintOrderModel.findOne({
        _id: orderId,
        user_id: userId,
      })
        .populate("service_option_id")
        .populate("personalized_book_id")
        .exec();

      if (!order) {
        throw new ErrorHandler("Print order not found", 404);
      }

      return order.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch print order", 500);
    }
  }

  static async updateStatus(orderId, status, trackingInfo = null) {
    try {
      const updateData = { status };
      if (trackingInfo) {
        updateData.tracking_info = trackingInfo;
        if (status === "shipped") {
          updateData.tracking_info.shipped_at = new Date();
        }
      }

      const updatedOrder = await PrintOrderModel.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true },
      ).exec();

      if (!updatedOrder) {
        throw new ErrorHandler("Print order not found", 404);
      }

      logger.info("Print order status updated", {
        orderId,
        status,
        trackingInfo: !!trackingInfo,
      });

      return updatedOrder.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update print order status", 500);
    }
  }

  static async updateLuluJobId(orderId, luluPrintJobId) {
    try {
      const updatedOrder = await PrintOrderModel.findByIdAndUpdate(
        orderId,
        {
          lulu_print_job_id: luluPrintJobId,
          status: "created",
        },
        { new: true },
      ).exec();

      if (!updatedOrder) {
        throw new ErrorHandler("Print order not found", 404);
      }

      return updatedOrder.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update Lulu job ID", 500);
    }
  }

  static async updateCostBreakdown(orderId, costBreakdown) {
    try {
      const updatedOrder = await PrintOrderModel.findByIdAndUpdate(
        orderId,
        { cost_breakdown: costBreakdown },
        { new: true },
      ).exec();

      if (!updatedOrder) {
        throw new ErrorHandler("Print order not found", 404);
      }

      return updatedOrder.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update cost breakdown", 500);
    }
  }

  static async cancelOrder(orderId, userId) {
    try {
      const order = await PrintOrderModel.findOne({
        _id: orderId,
        user_id: userId,
      });

      if (!order) {
        throw new ErrorHandler("Print order not found", 404);
      }

      // Only allow cancellation if order hasn't been sent to production
      const cancellableStatuses = ["draft", "created", "unpaid"];
      if (!cancellableStatuses.includes(order.status)) {
        throw new ErrorHandler(
          "Cannot cancel order that is already in production",
          400,
        );
      }

      order.status = "canceled";
      await order.save();

      // If already submitted to Lulu, cancel there too
      if (order.lulu_print_job_id) {
        try {
          const luluService = new LuluAPIService();
          await luluService.cancelPrintJob(order.lulu_print_job_id);
        } catch (luluError) {
          logger.error("Failed to cancel Lulu print job", {
            orderId,
            luluJobId: order.lulu_print_job_id,
            error: luluError.message,
          });
        }
      }

      logger.info("Print order cancelled", { orderId, userId });

      return order.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to cancel print order", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

const PrintOrderModel = mongoose.model("PrintOrder", printOrderSchema);
export default PrintOrder;

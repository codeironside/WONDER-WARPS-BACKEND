import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import stripeService from "../../../CORE/services/stripe/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import crypto from "crypto";
import os from "os";

const receiptSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    personalized_book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PersonalizedBook",
      required: true,
      index: true,
    },
    reference_code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripe_payment_intent_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripe_customer_id: {
      type: String,
      index: true,
    },
    stripe_charge_id: {
      type: String,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "succeeded",
        "canceled",
        "failed",
      ],
      default: "pending",
      index: true,
    },
    payment_method: {
      type: String,
    },
    receipt_url: {
      type: String,
    },
    receipt_number: {
      type: String,
    },
    book_details: {
      book_title: String,
      child_name: String,
      child_age: Number,
      genre: String,
      author: String,
    },
    user_details: {
      email: String,
      name: String,
      username: String,
    },
    metadata: {
      type: Map,
      of: String,
      default: new Map(),
    },
    paid_at: {
      type: Date,
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    refund_amount: {
      type: Number,
      default: 0,
    },
    refunded_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

receiptSchema.index({ user_id: 1, created_at: -1 });
receiptSchema.index({ personalized_book_id: 1 });
receiptSchema.index({ reference_code: 1 }, { unique: true });
receiptSchema.index({ status: 1, created_at: -1 });
receiptSchema.index({ "book_details.genre": 1 });
receiptSchema.index({ paid_at: -1 });
receiptSchema.index({ user_id: 1, status: 1 });

const ReceiptModel = mongoose.model("Receipt", receiptSchema);

class Receipt {
  static validationSchema = Joi.object({
    user_id: Joi.string().hex().length(24).required(),
    personalized_book_id: Joi.string().hex().length(24).required(),
    reference_code: Joi.string().required(),
    stripe_payment_intent_id: Joi.string().required(),
    stripe_customer_id: Joi.string().optional().allow("", "not_available"),
    stripe_charge_id: Joi.string().optional().allow("", "not_available"),
    amount: Joi.number().positive().precision(2).required(),
    currency: Joi.string().length(3).uppercase().default("USD"),
    status: Joi.string()
      .valid(
        "pending",
        "processing",
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "succeeded",
        "canceled",
        "failed",
      )
      .default("pending"),
    payment_method: Joi.string().optional().default("card"),
    receipt_url: Joi.string().optional().allow("", "pending", "not_available"),
    receipt_number: Joi.string()
      .optional()
      .allow("", "pending", "not_available"),
    book_details: Joi.object({
      book_title: Joi.string().required(),
      child_name: Joi.string().required(),
      child_age: Joi.number().min(0).max(18).optional(),
      genre: Joi.string().optional(),
      author: Joi.string().optional(),
    }).required(),
    user_details: Joi.object({
      email: Joi.string().email().required(),
      name: Joi.string().required(),
      username: Joi.string().required(),
    }).required(),
    metadata: Joi.object().optional(),
    paid_at: Joi.date().optional(),
    refunded: Joi.boolean().default(false),
    refund_amount: Joi.number().min(0).precision(2).default(0),
    refunded_at: Joi.date().optional(),
  }).unknown(false);

  static async create(data) {
    try {
      const { error, value: validatedData } = this.validationSchema.validate(
        data,
        {
          abortEarly: false,
          stripUnknown: true,
        },
      );

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const existingReceipt = await ReceiptModel.findOne({
        stripe_payment_intent_id: validatedData.stripe_payment_intent_id,
      });

      if (existingReceipt) {
        return await this.updateReceiptByPaymentIntent(
          validatedData.stripe_payment_intent_id,
          validatedData,
        );
      }

      const newReceipt = new ReceiptModel(validatedData);
      await newReceipt.save();

      logger.info("Receipt created successfully", {
        receiptId: newReceipt._id,
        referenceCode: validatedData.reference_code,
        userId: validatedData.user_id,
      });

      return newReceipt.toObject();
    } catch (error) {
      if (error.code === 11000) {
        const existingReceipt = await ReceiptModel.findOne({
          stripe_payment_intent_id: data.stripe_payment_intent_id,
        });

        if (existingReceipt) {
          return await this.updateReceiptByPaymentIntent(
            data.stripe_payment_intent_id,
            data,
          );
        }

        throw new ErrorHandler(
          "Receipt with this reference code already exists",
          409,
        );
      }
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to create receipt: ${error.message}`, 500);
    }
  }

  static async updateReceiptByPaymentIntent(paymentIntentId, updateData) {
    try {
      const updatedReceipt = await ReceiptModel.findOneAndUpdate(
        { stripe_payment_intent_id: paymentIntentId },
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!updatedReceipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }

      logger.info("Receipt updated by payment intent", {
        receiptId: updatedReceipt._id,
        paymentIntentId,
      });

      return updatedReceipt.toObject();
    } catch (error) {
      throw new ErrorHandler("Failed to update receipt", 500);
    }
  }

  static async createFromPayment(paymentData, bookData, userData) {
    try {
      const existingReceipt = await this.findByPaymentIntentId(
        paymentData.payment_intent_id,
      );

      if (existingReceipt) {
        return await this.updateReceiptByPaymentIntent(
          paymentData.payment_intent_id,
          {
            status: "succeeded",
            receipt_url: paymentData.receipt_url,
            receipt_number: paymentData.receipt_number,
            paid_at: paymentData.paid_at,
          },
        );
      }

      const stripeReceipt = await stripeService.getReceipt(
        paymentData.payment_intent_id,
      );

      const receiptData = {
        user_id: paymentData.user_id,
        personalized_book_id: paymentData.personalized_book_id,
        reference_code: this.generateReferenceCode(),
        stripe_payment_intent_id: paymentData.payment_intent_id,
        stripe_customer_id: paymentData.customer_id,
        stripe_charge_id: paymentData.charge_id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: "succeeded",
        payment_method: paymentData.payment_method,
        receipt_url: stripeReceipt.receipt_url,
        receipt_number: stripeReceipt.receipt_number,
        book_details: {
          book_title: bookData.book_title,
          child_name: bookData.child_name,
          child_age: bookData.child_age,
          genre: bookData.genre,
          author: bookData.author,
        },
        user_details: {
          email: userData.email,
          name: userData.name,
          username: userData.username,
        },
        paid_at: stripeReceipt.paid_at,
        metadata: new Map(Object.entries(stripeReceipt.metadata || {})),
      };

      return await this.create(receiptData);
    } catch (error) {
      console.log(error);
      logger.error("Failed to create receipt from payment", {
        error: error.message,
        paymentData,
      });
      throw new ErrorHandler("Failed to create payment receipt", 500);
    }
  }

  static async createForSuccessfulPayment(paymentData, bookData, userData) {
    try {
      const existingReceipt = await this.findByPaymentIntentId(
        paymentData.payment_intent_id,
      );

      if (existingReceipt) {
        const updateData = {
          status: "succeeded",
          payment_method: paymentData.payment_method || "card",
          paid_at: new Date(),
          stripe_customer_id:
            paymentData.customer_id || existingReceipt.stripe_customer_id,
          stripe_charge_id:
            paymentData.charge_id || existingReceipt.stripe_charge_id,
          receipt_url: existingReceipt.receipt_url || "pending",
          receipt_number: existingReceipt.receipt_number || "pending",
        };

        return await this.updateReceiptByPaymentIntent(
          paymentData.payment_intent_id,
          updateData,
        );
      }

      const receiptData = {
        user_id: paymentData.user_id,
        personalized_book_id: paymentData.personalized_book_id,
        reference_code: this.generateReferenceCode(),
        stripe_payment_intent_id: paymentData.payment_intent_id,
        stripe_customer_id: paymentData.customer_id || "not_available",
        stripe_charge_id: paymentData.charge_id || "not_available",
        amount: paymentData.amount,
        currency: paymentData.currency || "usd",
        status: "succeeded",
        payment_method: paymentData.payment_method || "card",
        receipt_url: "pending",
        receipt_number: "pending",
        book_details: {
          book_title: bookData.book_title || "Personalized Book",
          child_name: bookData.child_name || "Unknown",
          child_age: bookData.child_age,
          genre: bookData.genre || "Unknown",
          author: bookData.author || "Unknown",
        },
        user_details: {
          email: userData.email,
          name: userData.name || "Unknown",
          username: userData.username || "Unknown",
        },
        paid_at: new Date(),
        metadata: new Map(Object.entries(paymentData.metadata || {})),
      };

      try {
        const stripeReceipt = await stripeService.getReceipt(
          paymentData.payment_intent_id,
        );
        if (stripeReceipt) {
          receiptData.receipt_url =
            stripeReceipt.receipt_url || "not_available";
          receiptData.receipt_number =
            stripeReceipt.receipt_number || "not_available";

          if (stripeReceipt.customer && !receiptData.stripe_customer_id) {
            receiptData.stripe_customer_id = stripeReceipt.customer;
          }
          if (stripeReceipt.charge && !receiptData.stripe_charge_id) {
            receiptData.stripe_charge_id = stripeReceipt.charge;
          }
        }
      } catch (stripeError) {
        logger.warn(
          "Could not fetch Stripe receipt details immediately, will retry later",
          {
            paymentIntentId: paymentData.payment_intent_id,
            error: stripeError.message,
          },
        );
      }

      const receipt = await this.create(receiptData);

      setTimeout(async () => {
        try {
          const stripeReceipt = await stripeService.getReceipt(
            paymentData.payment_intent_id,
          );
          if (stripeReceipt && stripeReceipt.receipt_url) {
            await ReceiptModel.findByIdAndUpdate(receipt._id, {
              $set: {
                receipt_url: stripeReceipt.receipt_url,
                receipt_number: stripeReceipt.receipt_number || "not_available",
                ...(stripeReceipt.customer && {
                  stripe_customer_id: stripeReceipt.customer,
                }),
                ...(stripeReceipt.charge && {
                  stripe_charge_id: stripeReceipt.charge,
                }),
              },
            });
          }
        } catch (retryError) {
          logger.warn(
            "Failed to update receipt with Stripe details in background",
          );
        }
      }, 30000);

      return receipt;
    } catch (error) {
      console.log(error);
      logger.error("Failed to create receipt for successful payment", {
        error: error.message,
      });
      throw new ErrorHandler("Failed to create payment receipt", 500);
    }
  }

  static async findByPaymentIntentId(paymentIntentId) {
    try {
      const receipt = await ReceiptModel.findOne({
        stripe_payment_intent_id: paymentIntentId,
      }).lean();

      return receipt;
    } catch (error) {
      logger.error("Failed to find receipt by payment intent ID", {
        error: error.message,
        paymentIntentId,
      });
      throw new ErrorHandler(
        "Failed to find receipt by payment intent ID",
        500,
      );
    }
  }

  static async markAsRefunded(receiptId, refundAmount, refundReason = null) {
    try {
      const updateData = {
        refunded: true,
        refund_amount: refundAmount,
        refunded_at: new Date(),
      };

      if (refundReason) {
        updateData.metadata = { refund_reason: refundReason };
      }

      const updatedReceipt = await ReceiptModel.findByIdAndUpdate(
        receiptId,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!updatedReceipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }

      logger.info("Receipt marked as refunded", {
        receiptId,
        refundAmount,
      });

      return updatedReceipt.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to mark receipt as refunded", 500);
    }
  }

  static async findOneForUser(receiptId, userId) {
    try {
      const receipt = await ReceiptModel.findOne({
        _id: receiptId,
        user_id: userId,
      })
        .populate(
          "personalized_book_id",
          "personalized_content child_name child_age",
        )
        .lean();

      if (!receipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }

      return receipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to retrieve receipt", 500);
    }
  }

  static async findAllForUser(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
        status,
        startDate,
        endDate,
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const query = { user_id: userId };

      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const receipts = await ReceiptModel.find(query)
        .populate("personalized_book_id", "personalized_content")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await ReceiptModel.countDocuments(query);

      return {
        receipts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to retrieve user receipts", 500);
    }
  }

  static async findAllForAdmin(options = {}) {
    try {
      const {
        page = 1,
        sortBy = "createdAt",
        sortOrder = "desc",
        filters = {},
      } = options;

      const limit = 20;
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const query = {};

      if (filters.status) query.status = filters.status;
      if (filters.user_id) query.user_id = filters.user_id;
      if (filters.min_amount)
        query.amount = { $gte: parseFloat(filters.min_amount) };
      if (filters.max_amount) {
        query.amount = query.amount || {};
        query.amount.$lte = parseFloat(filters.max_amount);
      }
      if (filters.start_date)
        query.createdAt = { $gte: new Date(filters.start_date) };
      if (filters.end_date) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = new Date(filters.end_date);
      }
      if (filters.genre) query["book_details.genre"] = filters.genre;

      const receipts = await ReceiptModel.find(query)
        .populate("user_id", "username email firstname lastname")
        .populate("personalized_book_id", "personalized_content")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await ReceiptModel.countDocuments(query);

      return {
        receipts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to retrieve receipts for admin", 500);
    }
  }
  static async findByReferenceCode(referenceCode, userId = null) {
    try {
      const query = { reference_code: referenceCode };
      if (userId) {
        query.user_id = userId;
      }

      const receipt = await ReceiptModel.findOne(query)
        .populate("user_id", "username email firstname lastname")
        .populate("personalized_book_id")
        .lean();

      if (!receipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }

      return receipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find receipt by reference code", 500);
    }
  }

  static async getPlatformStatistics(timeRange = "all") {
    try {
      const dateFilter = this.getDateFilter(timeRange);
      const matchStage = dateFilter
        ? { paid_at: dateFilter }
        : { status: "succeeded" };

      const [
        totalRevenue,
        totalBooksPaid,
        revenueByGenre,
        recentPayments,
        averageOrderValue,
      ] = await Promise.all([
        ReceiptModel.aggregate([
          { $match: { ...matchStage, status: "succeeded" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),

        ReceiptModel.countDocuments({ ...matchStage, status: "succeeded" }),
        ReceiptModel.aggregate([
          { $match: { ...matchStage, status: "succeeded" } },
          {
            $group: {
              _id: "$book_details.genre",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ]),

        ReceiptModel.countDocuments({
          status: "succeeded",
          paid_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),

        ReceiptModel.aggregate([
          { $match: { ...matchStage, status: "succeeded" } },
          { $group: { _id: null, average: { $avg: "$amount" } } },
        ]),
      ]);

      const popularBooks = await ReceiptModel.aggregate([
        { $match: { ...matchStage, status: "succeeded" } },
        {
          $group: {
            _id: "$book_details.book_title",
            count: { $sum: 1 },
            total_revenue: { $sum: "$amount" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);

      return {
        total_revenue: totalRevenue[0]?.total || 0,
        total_books_paid: totalBooksPaid,
        average_order_value: averageOrderValue[0]?.average || 0,
        recent_payments: recentPayments,
        revenue_by_genre: revenueByGenre,
        popular_books: popularBooks,
        time_range: timeRange,
      };
    } catch (error) {
      logger.error("Failed to get platform statistics", {
        error: error.message,
      });
      throw new ErrorHandler("Failed to retrieve platform statistics", 500);
    }
  }

  static async getUserStatistics(userId) {
    try {
      const [userStats, genreStats, recentPayments] = await Promise.all([
        ReceiptModel.aggregate([
          {
            $match: {
              user_id: new mongoose.Types.ObjectId(userId),
              status: "succeeded",
            },
          },
          {
            $group: {
              _id: null,
              total_spent: { $sum: "$amount" },
              total_books: { $sum: 1 },
              average_spent: { $avg: "$amount" },
            },
          },
        ]),

        ReceiptModel.aggregate([
          {
            $match: {
              user_id: new mongoose.Types.ObjectId(userId),
              status: "succeeded",
            },
          },
          {
            $group: {
              _id: "$book_details.genre",
              count: { $sum: 1 },
              total_spent: { $sum: "$amount" },
            },
          },
          { $sort: { count: -1 } },
        ]),

        ReceiptModel.countDocuments({
          user_id: userId,
          status: "succeeded",
          paid_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),
      ]);

      const favoriteGenre = genreStats.length > 0 ? genreStats[0] : null;

      return {
        total_spent: userStats[0]?.total_spent || 0,
        total_books: userStats[0]?.total_books || 0,
        average_spent: userStats[0]?.average_spent || 0,
        recent_payments: recentPayments,
        favorite_genre: favoriteGenre,
        genre_breakdown: genreStats,
      };
    } catch (error) {
      throw new ErrorHandler("Failed to retrieve user statistics", 500);
    }
  }

  static async updateStatus(receiptId, status, updates = {}) {
    try {
      const allowedStatuses = [
        "pending",
        "processing",
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "succeeded",
        "canceled",
        "failed",
      ];

      if (!allowedStatuses.includes(status)) {
        throw new ErrorHandler("Invalid receipt status", 400);
      }

      const updateData = { status, ...updates };

      if (status === "succeeded" && !updates.paid_at) {
        updateData.paid_at = new Date();
      }

      const updatedReceipt = await ReceiptModel.findByIdAndUpdate(
        receiptId,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!updatedReceipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }

      logger.info("Receipt status updated", {
        receiptId,
        status,
        updates,
      });

      return updatedReceipt.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update receipt status", 500);
    }
  }

  static generateReferenceCode() {
    const timestamp =
      Date.now().toString(36) + process.hrtime.bigint().toString(36);
    const cryptoRandom = crypto.randomBytes(8).toString("hex");
    const systemId =
      process.pid.toString(36) +
      os
        .hostname()
        .split("")
        .reduce((a, b) => a + b.charCodeAt(0), 0)
        .toString(36) +
      Math.random().toString(36).substring(2, 6);
    const sequence = (this.generateReferenceCode.counter =
      (this.generateReferenceCode.counter || 0) + 1).toString(36);

    const parts = [
      timestamp.padStart(12, "0").slice(-12),
      cryptoRandom.padStart(16, "0").slice(-16),
      systemId.padStart(10, "0").slice(-10),
      sequence.padStart(4, "0").slice(-4),
    ];

    const referenceCode = `MSH-${parts.join("-")}`;
    const checksum = crypto
      .createHash("md5")
      .update(referenceCode)
      .digest("hex")
      .slice(0, 4)
      .toUpperCase();

    return `${referenceCode}-${checksum}`;
  }

  static getDateFilter(timeRange) {
    const now = new Date();
    switch (timeRange) {
      case "today":
        return { $gte: new Date(now.setHours(0, 0, 0, 0)) };
      case "week":
        return { $gte: new Date(now.setDate(now.getDate() - 7)) };
      case "month":
        return { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
      case "year":
        return { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
      default:
        return null;
    }
  }

  static async findOneForUserAdmin(receiptId, userId) {
    try {
      const receipt = await ReceiptModel.findOne({
        _id: receiptId,
        user_id: userId,
      })
        .populate("user_id", "username email firstname lastname phonenumber")
        .populate(
          "personalized_book_id",
          "child_name child_age gender_preference personalized_content",
        )
        .lean();

      if (!receipt) {
        throw new ErrorHandler("Receipt not found for this user", 404);
      }

      const formattedReceipt = {
        ...receipt,
        book_info: {
          child_name: receipt.personalized_book_id?.child_name,
          child_age: receipt.personalized_book_id?.child_age,
          gender_preference: receipt.personalized_book_id?.gender_preference,
          book_title:
            receipt.personalized_book_id?.personalized_content?.book_title,
          genre: receipt.personalized_book_id?.personalized_content?.genre,
          author: receipt.personalized_book_id?.personalized_content?.author,
          chapters_count:
            receipt.personalized_book_id?.personalized_content?.chapters
              ?.length || 0,
          cover_image:
            receipt.personalized_book_id?.personalized_content
              ?.cover_image?.[0],
        },
        user_info: {
          username: receipt.user_id?.username,
          email: receipt.user_id?.email,
          name: `${receipt.user_id?.firstname} ${receipt.user_id?.lastname}`,
          phone: receipt.user_id?.phonenumber,
        },
      };

      delete formattedReceipt.personalized_book_id;
      delete formattedReceipt.user_id;

      return formattedReceipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to retrieve receipt for user", 500);
    }
  }

  static async findByReferenceCodeAdmin(referenceCode) {
    try {
      const receipt = await ReceiptModel.findOne({
        reference_code: referenceCode,
      })
        .populate(
          "user_id",
          "username email firstname lastname phonenumber createdAt",
        )
        .populate(
          "personalized_book_id",
          "child_name child_age gender_preference personalized_content created_at",
        )
        .lean();

      if (!receipt) {
        throw new ErrorHandler("Receipt not found", 404);
      }
      const formattedReceipt = {
        ...receipt,
        book_info: {
          book_id: receipt.personalized_book_id?._id,
          child_name: receipt.personalized_book_id?.child_name,
          child_age: receipt.personalized_book_id?.child_age,
          gender_preference: receipt.personalized_book_id?.gender_preference,
          book_title:
            receipt.personalized_book_id?.personalized_content?.book_title,
          genre: receipt.personalized_book_id?.personalized_content?.genre,
          author: receipt.personalized_book_id?.personalized_content?.author,
          suggested_font:
            receipt.personalized_book_id?.personalized_content?.suggested_font,
          chapters_count:
            receipt.personalized_book_id?.personalized_content?.chapters
              ?.length || 0,
          cover_image:
            receipt.personalized_book_id?.personalized_content
              ?.cover_image?.[0],
          created_at: receipt.personalized_book_id?.created_at,
          character_details: {
            skin_tone:
              receipt.personalized_book_id?.personalized_content?.skin_tone,
            hair_type:
              receipt.personalized_book_id?.personalized_content?.hair_type,
            hair_style:
              receipt.personalized_book_id?.personalized_content?.hair_style,
            hair_color:
              receipt.personalized_book_id?.personalized_content?.hair_color,
            eye_color:
              receipt.personalized_book_id?.personalized_content?.eye_color,
            clothing:
              receipt.personalized_book_id?.personalized_content?.clothing,
            gender: receipt.personalized_book_id?.personalized_content?.gender,
          },
        },
        user_info: {
          user_id: receipt.user_id?._id,
          username: receipt.user_id?.username,
          email: receipt.user_id?.email,
          name: `${receipt.user_id?.firstname} ${receipt.user_id?.lastname}`,
          phone: receipt.user_id?.phonenumber,
          account_created: receipt.user_id?.createdAt,
        },
        payment_info: {
          reference_code: receipt.reference_code,
          stripe_payment_intent_id: receipt.stripe_payment_intent_id,
          stripe_charge_id: receipt.stripe_charge_id,
          payment_method: receipt.payment_method,
          amount: receipt.amount,
          currency: receipt.currency,
          paid_at: receipt.paid_at,
          refund_status: receipt.refunded ? "refunded" : "not_refunded",
          refund_amount: receipt.refund_amount,
          refunded_at: receipt.refunded_at,
        },
      };

      delete formattedReceipt.personalized_book_id;
      delete formattedReceipt.user_id;

      return formattedReceipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find receipt by reference code", 500);
    }
  }

  static async findByPaymentIntentIdAdmin(paymentIntentId) {
    try {
      const receipt = await ReceiptModel.findOne({
        stripe_payment_intent_id: paymentIntentId,
      })
        .populate("user_id", "username email firstname lastname")
        .populate(
          "personalized_book_id",
          "child_name child_age personalized_content",
        )
        .lean();

      if (!receipt) {
        throw new ErrorHandler(
          "Receipt not found for this payment intent",
          404,
        );
      }

      const formattedReceipt = {
        ...receipt,
        book_info: {
          child_name: receipt.personalized_book_id?.child_name,
          child_age: receipt.personalized_book_id?.child_age,
          book_title:
            receipt.personalized_book_id?.personalized_content?.book_title,
          genre: receipt.personalized_book_id?.personalized_content?.genre,
        },
        user_info: {
          username: receipt.user_id?.username,
          email: receipt.user_id?.email,
          name: `${receipt.user_id?.firstname} ${receipt.user_id?.lastname}`,
        },
      };

      delete formattedReceipt.personalized_book_id;
      delete formattedReceipt.user_id;

      return formattedReceipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        "Failed to find receipt by payment intent ID",
        500,
      );
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default Receipt;

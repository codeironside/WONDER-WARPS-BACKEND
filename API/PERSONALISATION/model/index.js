import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import User from "../../AUTH/model/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import stripeService from "../../../CORE/services/stripe/index.js";
import emailService from "../../../CORE/services/Email/index.js";
import Receipt from "../../PAYMENT/model/index.js";
import crypto from "crypto";
import BookTemplate from "../../BOOK_TEMPLATE/model/index.js";
import { config } from "../../../CORE/utils/config/index.js";

const personalizedBookSchema = new mongoose.Schema(
  {
    original_template_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    user_id: { type: String, required: true },
    purchaser_id: {
      type: String,
      default: function () {
        return this.user_id;
      },
      index: true,
    },
    child_name: { type: String, required: true, trim: true, maxlength: 255 },
    child_age: { type: Number, min: 0, max: 18, default: null },
    gender_preference: {
      type: String,
      enum: ["male", "female", "neutral"],
      default: null,
    },
    price: { type: Number, required: true, min: 0 },
    is_paid: { type: Boolean, default: false },
    dedication_message: { type: String, default: " Dedication message" },
    payment_id: { type: String, trim: true, maxlength: 255, default: null },
    payment_date: { type: Date, default: null },
    personalized_content: {
      type: Object,
      default: null,
      required: false,
    },
    is_personalized: { type: Boolean, default: false },
    is_gift: { type: Boolean, default: false },
    gift_metadata: {
      recipient_email: {
        type: String,
        trim: true,
        lowercase: true,
        default: null,
      },
      recipient_name: { type: String, trim: true, default: null },
      sender_name: { type: String, trim: true, default: null },
      gift_message: { type: String, maxlength: 500, default: null },
      claim_token: { type: String, default: null, index: true },
      is_claimed: { type: Boolean, default: false },
      claimed_at: { type: Date, default: null },
      status: { type: String, default: "null" },
    },
    shipping_details: {
      full_name: { type: String, default: null },
      address_line1: { type: String, default: null },
      address_line2: { type: String, default: null },
      city: { type: String, default: null },
      state: { type: String, default: null },
      postal_code: { type: String, default: null },
      country: { type: String, default: null },
      phone_number: { type: String, default: null },
      email: { type: String, default: null },
    },
    is_processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    personalization_date: { type: Date, default: null },
    cover_image: [{ type: String, required: true }],
    video_url: { type: String, required: true },
    book_title: { type: String, trim: true, maxlength: 255 },
    genre: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true },
);

personalizedBookSchema.index({ user_id: 1 });
personalizedBookSchema.index({ original_template_id: 1 });
personalizedBookSchema.index({ created_at: -1 });
personalizedBookSchema.index({ is_paid: 1 });
personalizedBookSchema.index({ is_personalized: 1 });

const PersonalizedBookModel = mongoose.model(
  "PersonalizedBook",
  personalizedBookSchema,
);

class PersonalizedBook {
  static creationValidationSchema = Joi.object({
    original_template_id: Joi.string().trim().min(1).max(255).required(),
    user_id: Joi.string().trim().min(1).max(255).required(),
    video_url: Joi.string().trim().min(1).max(255).required(),
    cover_image: Joi.array().items(Joi.string()).min(1).required(),
    child_name: Joi.string().trim().min(1).max(255).required(),
    child_age: Joi.number().integer().min(0).max(18).allow(null).optional(),
    gender_preference: Joi.string()
      .valid("male", "female", "neutral")
      .allow(null)
      .optional(),
    price: Joi.number().precision(2).positive().required(),
    book_title: Joi.string().trim().max(255).optional(),
    genre: Joi.string().trim().max(100).optional(),
    is_gift: Joi.boolean().optional(),
    purchaser_id: Joi.string().optional(), // Made optional to allow default behavior
    gift_details: Joi.object({
      recipient_email: Joi.string().email().required(),
      recipient_name: Joi.string().trim().optional(),
      sender_name: Joi.string().trim().optional(),
      gift_message: Joi.string().max(500).optional(),
    })
      .when("is_gift", {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .unknown(false),
  });

  static giftValidationSchema = Joi.object({
    recipient_email: Joi.string().email().required(),
    recipient_name: Joi.string().trim().min(1).required(),
    sender_name: Joi.string().trim().optional(),
    gift_message: Joi.string().max(1000).optional(),
  }).unknown(false);

  static personalizationValidationSchema = Joi.object({
    personalized_content: Joi.object().required(),
    dedication_message: Joi.string().max(1000).optional(),
  }).unknown(false);

  // Shipping Validation Schema
  static shippingValidationSchema = Joi.object({
    full_name: Joi.string().required().label("Full Name"),
    address_line1: Joi.string().required().label("Address Line 1"),
    address_line2: Joi.string()
      .allow(null, "")
      .optional()
      .label("Address Line 2"),
    city: Joi.string().required().label("City"),
    state: Joi.string().required().label("State/Province"),
    postal_code: Joi.string().required().label("Postal Code"),
    country: Joi.string().required().label("Country"),
    phone_number: Joi.string().required().label("Phone Number"),
    email: Joi.string().email().required().label("Contact Email"),
  }).unknown(false);

  static updateValidationSchema = Joi.object({
    dedication_message: Joi.string().max(1000).optional(),
  }).unknown(false);

  static async saveShippingDetails(bookId, userId, shippingData) {
    try {
      const { error, value: validatedData } =
        this.shippingValidationSchema.validate(shippingData, {
          abortEarly: false,
          stripUnknown: true,
        });

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      });

      if (!book) {
        throw new ErrorHandler("Book not found or unauthorized", 404);
      }

      if (book.is_processed) {
        throw new ErrorHandler(
          "Book is already processed, shipping details cannot be changed",
          403,
        );
      }

      if (book.is_gift && book.user_id === book.purchaser_id) {
        throw new ErrorHandler(
          "Gifts must be claimed by the recipient before adding shipping details.",
          403,
        );
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      book.shipping_details = validatedData;
      await book.save();

      logger.info(`Shipping details saved for book ${bookId}`, { userId });

      try {
        await emailService.sendShippingConfirmationEmail(
          user.email,
          user.username || user.firstname || "there",
          validatedData,
          {
            book_title: book.book_title || "Your Personalized Book",
            child_name: book.child_name,
            order_id: book._id.toString(),
            is_gift: book.is_gift,
            ...(book.is_gift && {
              gift_info: {
                sender: book.gift_metadata?.sender_name || "A friend",
                message: book.gift_metadata?.gift_message || "",
              },
            }),
          },
        );
      } catch (emailError) {
        logger.error("Failed to send shipping confirmation email:", emailError);
      }

      return book.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to save shipping details: ${error.message}`,
        500,
      );
    }
  }

  static async updateProcessedStatus(bookId, isProcessed) {
    try {
      const book = await PersonalizedBookModel.findById(bookId);

      if (!book) {
        throw new ErrorHandler("Book not found", 404);
      }

      if (isProcessed) {
        if (!book.shipping_details?.full_name) {
          throw new ErrorHandler(
            "Cannot mark as processed without shipping details",
            400,
          );
        }
        if (!book.is_paid) {
          throw new ErrorHandler(
            "Cannot mark as processed without payment",
            400,
          );
        }
        book.processed_date = new Date();

        const user = await User.findById(book.user_id);
        if (user && user.email) {
          try {
            await emailService.sendProcessingNotificationEmail(
              user.email,
              user.username || user.firstname || "there",
              {
                book_title: book.book_title || "Your Personalized Book",
                child_name: book.child_name,
                order_id: book._id.toString(),
                processing_date: book.processed_date.toLocaleDateString(
                  "en-US",
                  {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                ),
              },
            );
            logger.info(
              `Processing notification email sent for book ${bookId}`,
              {
                userEmail: user.email,
              },
            );
          } catch (error) {
            logger.error(
              "Failed to send processing notification email:",
              error,
            );
          }
        }
      } else {
        book.processed_date = null;
      }

      book.is_processed = isProcessed;
      await book.save();

      logger.info(`Book processing status updated for book ${bookId}`, {
        is_processed: isProcessed,
      });

      return book.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to update processing status: ${error.message}`,
        500,
      );
    }
  }

  static async createBookForPayment(data) {
    try {
      const { error, value: validatedData } =
        this.creationValidationSchema.validate(data, {
          abortEarly: false,
          stripUnknown: true,
        });

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const bookData = {
        ...validatedData,
        // Fallback handled by Schema default if purchaser_id is missing
        purchaser_id: validatedData.purchaser_id || validatedData.user_id,
        personalized_content: null,
        is_personalized: false,
      };

      const newBook = new PersonalizedBookModel(bookData);
      await newBook.save();

      return newBook.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create book for payment: ${error.message}`,
        500,
      );
    }
  }

  static async findOneForAdmin(id, options = {}) {
    try {
      const { includeChapters = true } = options;

      const book = await PersonalizedBookModel.findById(id).lean();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (book.original_template_id) {
        let template;

        if (includeChapters) {
          template = await BookTemplate.findByIdWithChapters(
            book.original_template_id,
          );
        } else {
          template = await BookTemplate.findById(book.original_template_id);
          if (template) {
            template = template.toObject ? template.toObject() : template;
            template = {
              book_title: template.book_title,
              cover_image: template.cover_image,
              video_url: template.video_url,
            };
          }
        }

        if (template) {
          book.template_details = template;
        }
      }

      return book;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to find personalized book for admin: ${error.message}`,
        500,
      );
    }
  }

  static async initiateGift(bookId, userId, giftData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { error, value: validatedGiftData } =
        this.giftValidationSchema.validate(giftData);

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }
      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      }).session(session);

      if (!book) {
        throw new ErrorHandler(
          "Book not found or you do not have permission",
          404,
        );
      }

      if (!book.is_paid) {
        throw new ErrorHandler(
          "You must pay for the book before gifting it",
          402,
        );
      }

      if (book.is_gift && book.gift_metadata?.status === "claimed") {
        throw new ErrorHandler(
          "This book has already been gifted and claimed",
          400,
        );
      }

      const claimToken = crypto.randomBytes(32).toString("hex");
      book.purchaser_id = userId;
      book.is_gift = true;
      book.gift_metadata = {
        recipient_email: validatedGiftData.recipient_email,
        recipient_name: validatedGiftData.recipient_name,
        sender_name: validatedGiftData.sender_name || "A friend",
        gift_message: validatedGiftData.gift_message,
        claim_token: claimToken,
        status: "sent",
        sent_at: new Date(),
        is_claimed: false,
      };

      await book.save({ session });

      const claimUrl = `${config.app.base_url}/redeem-gift?token=${claimToken}`;

      try {
        await emailService.sendGiftNotificationEmail(
          validatedGiftData.recipient_email,
          {
            recipientName: validatedGiftData.recipient_name,
            senderName: validatedGiftData.sender_name,
            bookTitle: book.book_title,
            giftMessage: validatedGiftData.gift_message,
            claimUrl: claimUrl,
            coverImage: book.cover_image?.[0] || "",
          },
        );
      } catch (emailError) {
        logger.error("Failed to send gift email", emailError);
      }

      await session.commitTransaction();
      session.endSession();

      logger.info(
        `Book ${bookId} gifted to ${validatedGiftData.recipient_email}`,
      );
      return book.toObject();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to gift book: ${error.message}`, 500);
    }
  }

  static async claimGift(token, recipientUserId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log(token);
      const book = await PersonalizedBookModel.findOne({
        "gift_metadata.claim_token": token,
        "gift_metadata.status": "sent",
      }).session(session);

      if (!book) {
        throw new ErrorHandler("Invalid or expired gift link", 404);
      }

      const previousOwnerId = book.user_id;
      // Ensure purchaser_id is preserved as the original buyer (previousOwnerId)
      book.purchaser_id = previousOwnerId;
      book.user_id = recipientUserId;

      book.gift_metadata.status = "claimed";
      book.gift_metadata.is_claimed = true;
      book.gift_metadata.claimed_at = new Date();
      book.gift_metadata.claim_token = null;

      await book.save({ session });
      await session.commitTransaction();
      session.endSession();

      logger.info(
        `Gift ${book._id} transferred from ${previousOwnerId} to ${recipientUserId}`,
      );
      return book.toObject();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to claim gift: ${error.message}`, 500);
    }
  }

  static async findAllByUserForAdmin(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
        filters = {},
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const andConditions = [{ user_id: userId }];

      if (typeof filters.is_paid === "boolean") {
        andConditions.push({ is_paid: filters.is_paid });
      }

      if (filters.min_price !== undefined || filters.max_price !== undefined) {
        const priceQuery = {};
        if (filters.min_price !== undefined)
          priceQuery.$gte = Number(filters.min_price);
        if (filters.max_price !== undefined)
          priceQuery.$lte = Number(filters.max_price);
        andConditions.push({ price: priceQuery });
      }

      if (filters.start_date || filters.end_date) {
        const dateQuery = {};
        if (filters.start_date) dateQuery.$gte = new Date(filters.start_date);
        if (filters.end_date) dateQuery.$lte = new Date(filters.end_date);
        andConditions.push({ createdAt: dateQuery });
      }

      if (filters.search) {
        const searchRegex = new RegExp(filters.search, "i");
        andConditions.push({
          $or: [
            { book_title: searchRegex },
            { "personalized_content.book_title": searchRegex },
            { child_name: searchRegex },
            { "shipping_details.full_name": searchRegex },
            { "shipping_details.email": searchRegex },
          ],
        });
      }

      const query = { $and: andConditions };

      const books = await PersonalizedBookModel.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments(query);

      return {
        books,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler(
        `Failed to fetch user books for admin: ${error.message}`,
        500,
      );
    }
  }

  static async addPersonalization(
    bookId,
    userId,
    templateId,
    personalizationData,
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { error, value: validatedData } =
        this.personalizationValidationSchema.validate(personalizationData, {
          abortEarly: false,
          stripUnknown: true,
        });

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }
      console.log(
        ` book id ${bookId}, user id ${userId}, template id ${templateId}`,
      );
      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
        original_template_id: templateId,
      }).session(session);

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler("Payment required before personalization", 402);
      }

      if (book.is_personalized) {
        throw new ErrorHandler("Book already personalized", 400);
      }

      const updatedBook = await PersonalizedBookModel.findByIdAndUpdate(
        bookId,
        {
          personalized_content: validatedData.personalized_content,
          dedication_message:
            validatedData.dedication_message || book.dedication_message,
          is_personalized: true,
          personalization_date: new Date(),
        },
        { new: true, session },
      );

      await session.commitTransaction();
      session.endSession();

      logger.info("Personalization added successfully", {
        bookId,
        userId,
      });

      return updatedBook.toObject();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to add personalization: ${error.message}`,
        500,
      );
    }
  }

  static async findById(id) {
    try {
      const book = await PersonalizedBookModel.findById(id).exec();
      return book ? book.toObject() : null;
    } catch (error) {
      throw new ErrorHandler("Failed to find personalized book by ID", 500);
    }
  }

  static async findByUser(userId) {
    try {
      const books = await PersonalizedBookModel.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .exec();
      return books.map((book) => book.toObject());
    } catch (error) {
      throw new ErrorHandler("Failed to find personalized books by user", 500);
    }
  }

  static async updatePaymentStatus(bookId, paymentId, isPaid = true) {
    try {
      const paymentIdString =
        typeof paymentId === "string"
          ? paymentId
          : paymentId?.id || paymentId?.payment_intent || "unknown_payment_id";

      const updateData = {
        is_paid: isPaid,
        payment_id: paymentIdString,
        payment_date: isPaid ? new Date() : null,
      };

      const updatedBook = await PersonalizedBookModel.findByIdAndUpdate(
        bookId,
        updateData,
        { new: true },
      ).exec();

      if (!updatedBook) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      return updatedBook.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update payment status", 500);
    }
  }

  static async findByUserPaginated(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
      const books = await PersonalizedBookModel.find({ user_id: userId })
        .select("-personalized_content.chapters")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments({
        user_id: userId,
      });

      return {
        books,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to find personalized books by user", 500);
    }
  }

  static async findAllForAdminAdvanced(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
        filters = {},
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const andConditions = [];

      if (typeof filters.is_paid === "boolean") {
        andConditions.push({ is_paid: filters.is_paid });
      }

      if (filters.user_id) {
        andConditions.push({ user_id: filters.user_id });
      }

      if (filters.min_price !== undefined || filters.max_price !== undefined) {
        const priceQuery = {};
        if (filters.min_price !== undefined)
          priceQuery.$gte = Number(filters.min_price);
        if (filters.max_price !== undefined)
          priceQuery.$lte = Number(filters.max_price);
        andConditions.push({ price: priceQuery });
      }

      if (filters.start_date || filters.end_date) {
        const dateQuery = {};
        if (filters.start_date) dateQuery.$gte = new Date(filters.start_date);
        if (filters.end_date) dateQuery.$lte = new Date(filters.end_date);
        andConditions.push({ createdAt: dateQuery });
      }

      if (filters.genre) {
        andConditions.push({
          $or: [
            { genre: filters.genre },
            { "personalized_content.genre": filters.genre },
          ],
        });
      }

      if (filters.search) {
        const searchRegex = new RegExp(filters.search, "i");
        andConditions.push({
          $or: [
            { book_title: searchRegex },
            { "personalized_content.book_title": searchRegex },
            { child_name: searchRegex },
            { "shipping_details.full_name": searchRegex },
            { "shipping_details.email": searchRegex },
          ],
        });
      }

      const query = andConditions.length > 0 ? { $and: andConditions } : {};

      const books = await PersonalizedBookModel.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments(query);

      return {
        books,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler(
        `Failed to fetch admin books: ${error.message}`,
        500,
      );
    }
  }
  static async findByIdForUser(bookId, personsalisedId, userId) {
    try {
      console.log(
        ` book id ${bookId},user id ${userId}, personalised id ${personsalisedId}`,
      );
      // const originaltemplate = await  BookTemplate.findById(bookId)
      const book = await PersonalizedBookModel.findOne({
        _id: personsalisedId,
        user_id: userId,
        original_template_id: bookId,
      }).exec();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      return book;
    } catch (error) {
      console.log(error);
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find personalized book", 500);
    }
  }
  static async findByIdForUserPaid(bookId, userId) {
    try {
      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      }).exec();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      return book;
    } catch (error) {
      console.log(error);
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find personalized book", 500);
    }
  }

  static async findPaidBooksByUser(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const books = await PersonalizedBookModel.find({
        user_id: userId,
        is_paid: true,
      })
        .select("-personalized_content.chapters")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments({
        user_id: userId,
        is_paid: true,
      });

      return {
        books,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to find paid books by user", 500);
    }
  }

  static async updateDedicationMessage(bookId, userId, dedicationMessage) {
    try {
      if (!dedicationMessage || dedicationMessage.trim().length === 0) {
        throw new ErrorHandler("Dedication message is required", 400);
      }

      if (dedicationMessage.length > 1000) {
        throw new ErrorHandler(
          "Dedication message must be less than 1000 characters",
          400,
        );
      }

      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      });

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler(
          "Dedication message can only be updated after payment",
          402,
        );
      }

      const updatedBook = await PersonalizedBookModel.findByIdAndUpdate(
        bookId,
        {
          dedication_message: dedicationMessage.trim(),
          updatedAt: new Date(),
        },
        { new: true, runValidators: true },
      ).exec();

      if (!updatedBook) {
        throw new ErrorHandler("Failed to update dedication message", 500);
      }

      logger.info("Dedication message updated successfully", {
        bookId,
        userId,
        messageLength: dedicationMessage.length,
      });

      return updatedBook.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to update dedication message: ${error.message}`,
        500,
      );
    }
  }

  static async initiatePayment(bookId, userData) {
    try {
      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Book not found", 404);
      }

      if (book.is_paid) {
        throw new ErrorHandler("This book has already been paid for", 400);
      }

      const session = await stripeService.createCheckoutSession(
        book.price,
        {
          personalized_book_id: bookId.toString(),
          user_id: book.user_id.toString(),
          book_title: book.book_title || "Personalized Book",
          child_name: book.child_name,
        },
        userData,
        `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        `${process.env.CLIENT_URL}/payment/cancel`,
      );

      logger.info("Checkout session created for book payment", {
        bookId,
        sessionId: session.id,
        amount: book.price,
        url: session.url,
      });

      return {
        checkout_url: session.url,
        session_id: session.id,
        amount: book.price,
        currency: "usd",
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to initiate payment: ${error.message}`,
        500,
      );
    }
  }

  static async confirmPaymentWithSession(req, sessionId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const checkoutSession = await stripeService.getCheckoutSession(sessionId);

      if (!checkoutSession) {
        throw new ErrorHandler("Checkout session not found", 404);
      }

      if (checkoutSession.payment_status !== "paid") {
        throw new ErrorHandler(
          `Payment not completed: ${checkoutSession.payment_status}`,
          400,
        );
      }

      const bookId = checkoutSession.metadata.personalized_book_id;
      if (!bookId) {
        throw new ErrorHandler("Book ID not found in session metadata", 400);
      }

      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      stripeService.validatePaymentAmount(
        checkoutSession.amount_total / 100,
        book.price,
      );

      const paymentIntent = checkoutSession.payment_intent;
      if (!paymentIntent || typeof paymentIntent !== "object") {
        throw new ErrorHandler("Payment intent data not found", 400);
      }

      const paymentIntentId = paymentIntent.id;
      const chargeId = paymentIntent.latest_charge;
      const customerId = paymentIntent.customer;

      const updatedBook = await this.updatePaymentStatus(
        bookId,
        paymentIntentId,
        true,
      );

      const user = await User.findById(book.user_id);
      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      let paymentMethod;
      if (
        checkoutSession.payment_method_types &&
        checkoutSession.payment_method_types.length > 0
      ) {
        const methodType = checkoutSession.payment_method_types[0];
        paymentMethod = this.getHumanReadablePaymentMethod(methodType);
      }

      const receipt = await Receipt.createForSuccessfulPayment(
        {
          user_id: book.user_id,
          personalized_book_id: bookId,
          payment_intent_id: paymentIntentId,
          amount: checkoutSession.amount_total / 100,
          currency: checkoutSession.currency,
          customer_id: customerId,
          charge_id: chargeId,
          payment_method: paymentMethod,
          status: paymentIntent.status,
          metadata: checkoutSession.metadata || {},
        },
        {
          book_title: book.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.genre,
          author: book.personalized_content?.author,
          cover_image: book.personalized_content?.cover_image?.[0],
        },
        {
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
          username: user.username,
        },
      );

      await emailService.sendPaymentConfirmationEmail(
        req,
        user.email,
        user.username,
        (checkoutSession.amount_total / 100).toFixed(2),
        new Date(checkoutSession.created * 1000).toLocaleDateString(),
        bookId,
        book.book_title || "Personalized Story Book",
        book.child_name,
        (checkoutSession.amount_subtotal / 100).toFixed(2),
        "0.00",
        (
          (checkoutSession.amount_total - checkoutSession.amount_subtotal) /
          100
        ).toFixed(2),
        (checkoutSession.amount_total / 100).toFixed(2),
        receipt.reference_code,
        paymentMethod,
      );

      await session.commitTransaction();
      session.endSession();

      logger.info("Payment completed via checkout session", {
        bookId,
        sessionId,
        paymentIntentId,
        amount: checkoutSession.amount_total,
      });

      return {
        book: updatedBook,
        receipt: receipt,
        session: {
          id: checkoutSession.id,
          payment_intent: paymentIntentId,
          amount_total: checkoutSession.amount_total,
          currency: checkoutSession.currency,
          payment_status: checkoutSession.payment_status,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      logger.error("Payment confirmation with session failed", {
        error: error.message,
        sessionId,
      });

      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Payment confirmation failed: ${error.message}`,
        500,
      );
    }
  }

  static async handleCheckoutSessionCompleted(session) {
    const sessionMongo = await mongoose.startSession();
    sessionMongo.startTransaction();

    try {
      const { id: sessionId, metadata, amount_total } = session;
      const bookId = metadata.personalized_book_id;

      if (!bookId) {
        logger.warn("No book ID in checkout session metadata", {
          sessionId,
          metadata,
        });
        await sessionMongo.commitTransaction();
        sessionMongo.endSession();
        return;
      }

      const paymentIntentId = session.payment_intent;
      const existingReceipt =
        await Receipt.findByPaymentIntentId(paymentIntentId);
      if (existingReceipt) {
        logger.info("Receipt already exists for this payment", {
          paymentIntentId,
        });
        await sessionMongo.commitTransaction();
        sessionMongo.endSession();
        return;
      }

      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Book not found for successful payment", 404);
      }

      if (!book.is_paid) {
        await this.updatePaymentStatus(bookId, paymentIntentId, true);
      }

      const user = await User.findById(book.user_id);
      if (!user) {
        throw new ErrorHandler("User not found for payment", 404);
      }

      await Receipt.createForSuccessfulPayment(
        {
          user_id: book.user_id,
          personalized_book_id: bookId,
          payment_intent_id: paymentIntentId,
          amount: amount_total / 100,
          currency: session.currency,
          customer_id: session.customer,
          charge_id: session.payment_intent,
          payment_method: session.payment_method_types?.[0],
          status: "succeeded",
        },
        {
          book_title: book.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.genre,
          author: book.personalized_content?.author,
          cover_image: book.personalized_content?.cover_image?.[0],
        },
        {
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
          username: user.username,
        },
      );

      await sessionMongo.commitTransaction();
      sessionMongo.endSession();

      logger.info("Receipt created via checkout session webhook", {
        bookId,
        sessionId,
        amount: amount_total / 100,
      });
    } catch (error) {
      await sessionMongo.abortTransaction();
      sessionMongo.endSession();
      logger.error("Failed to process checkout session webhook", {
        error: error.message,
        sessionId: session.id,
      });
    }
  }

  static async getPaymentStats() {
    try {
      const paidCount = await PersonalizedBookModel.countDocuments({
        is_paid: true,
      });
      const unpaidCount = await PersonalizedBookModel.countDocuments({
        is_paid: false,
      });
      const totalRevenue = await PersonalizedBookModel.aggregate([
        { $match: { is_paid: true } },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]);

      return {
        paid: paidCount,
        unpaid: unpaidCount,
        total_revenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
      };
    } catch (error) {
      throw new ErrorHandler("Failed to get payment statistics", 500);
    }
  }

  static async getPersonalizationStats() {
    try {
      const personalizedCount = await PersonalizedBookModel.countDocuments({
        is_personalized: true,
      });
      const paidButNotPersonalizedCount =
        await PersonalizedBookModel.countDocuments({
          is_paid: true,
          is_personalized: false,
        });

      return {
        personalized: personalizedCount,
        paid_but_not_personalized: paidButNotPersonalizedCount,
      };
    } catch (error) {
      throw new ErrorHandler("Failed to get personalization statistics", 500);
    }
  }

  static getHumanReadablePaymentMethod(paymentMethodType) {
    const paymentMethodMap = {
      card: "Credit Card",
      credit_card: "Credit Card",
      debit_card: "Debit Card",
      paypal: "PayPal",
      apple_pay: "Apple Pay",
      google_pay: "Google Pay",
      bank_transfer: "Bank Transfer",
      ach_debit: "Bank Transfer (ACH)",
      sepa_debit: "SEPA Debit",
      link: "Link",
      us_bank_account: "US Bank Account",
      affirm: "Affirm",
      klarna: "Klarna",
      afterpay_clearpay: "Afterpay/Clearpay",
    };

    return paymentMethodMap[paymentMethodType] || "Credit Card";
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default PersonalizedBook;

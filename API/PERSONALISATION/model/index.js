import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import User from "../../AUTH/model/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import stripeService from "../../../CORE/services/stripe/index.js";
import emailService from "../../../CORE/services/Email/index.js";
const personalizedBookSchema = new mongoose.Schema(
  {
    original_template_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    user_id: { type: String, required: true },
    child_name: { type: String, required: true, trim: true, maxlength: 255 },
    child_age: { type: Number, min: 0, max: 18, default: null },
    gender_preference: {
      type: String,
      enum: ["male", "female", "neutral"],
      default: null,
    },
    price: { type: Number, required: true, min: 0 },
    is_paid: { type: Boolean, default: false },
    payment_id: { type: String, trim: true, maxlength: 255, default: null },
    payment_date: { type: Date, default: null },
    personalized_content: { type: Object, required: true },
  },
  { timestamps: true },
);

// Create indexes for better performance
personalizedBookSchema.index({ user_id: 1 });
personalizedBookSchema.index({ original_template_id: 1 });
personalizedBookSchema.index({ created_at: -1 });
personalizedBookSchema.index({ is_paid: 1 });

const PersonalizedBookModel = mongoose.model(
  "PersonalizedBook",
  personalizedBookSchema,
);

class PersonalizedBook {
  static validationSchema = Joi.object({
    original_template_id: Joi.string().trim().min(1).max(255).required(),
    user_id: Joi.string().trim().min(1).max(255).required(),
    child_name: Joi.string().trim().min(1).max(255).required(),
    child_age: Joi.number().integer().min(0).max(18).allow(null).optional(),
    gender_preference: Joi.string()
      .valid("male", "female", "neutral")
      .allow(null)
      .optional(),
    price: Joi.number().precision(2).positive().required(),
    is_paid: Joi.boolean().default(false),
    payment_id: Joi.string().trim().max(255).allow(null).optional(),
    payment_date: Joi.date().allow(null).optional(),
    personalized_content: Joi.object().required(),
  }).unknown(false);

  static async createPersonaliseBook(data) {
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

      const newBook = new PersonalizedBookModel(validatedData);
      await newBook.save();

      return newBook.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create personalized book: ${error.message}`,
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
      const updateData = {
        is_paid: isPaid,
        payment_id: paymentId,
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
  static async findByIdForUser(bookId, userId) {
    try {
      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      }).exec();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }
      logger.info(`fetch one book for one user`);

      return book;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find personalized book", 500);
    }
  }
  static async findAllForAdmin(options = {}) {
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

      // Build query based on filters
      const query = {};
      if (filters.is_paid !== undefined) query.is_paid = filters.is_paid;
      if (filters.user_id) query.user_id = filters.user_id;

      // Get books without chapters
      const books = await PersonalizedBookModel.find(query)
        .select("-personalized_content.chapters")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      // Get user information for all books
      const userIds = [...new Set(books.map((book) => book.user_id))];
      const users = await User.find({ _id: { $in: userIds } })
        .select("name email") // Select only necessary user fields
        .lean();

      // Create a user map for easy lookup
      const userMap = {};
      users.forEach((user) => {
        userMap[user._id] = user;
      });

      // Add user information to each book
      const booksWithUserInfo = books.map((book) => ({
        ...book,
        user: userMap[book.user_id] || null,
      }));

      const total = await PersonalizedBookModel.countDocuments(query);

      return {
        books: booksWithUserInfo,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler(
        "Failed to find personalized books for admin",
        500,
      );
    }
  }

  static async findByUserWithUserInfo(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      // Get user information
      const user = await User.findById(userId).select("name email").lean();

      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      // Get books without chapters
      const books = await PersonalizedBookModel.find({ user_id: userId })
        .select("-personalized_content.chapters")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments({
        user_id: userId,
      });

      // Add user information to each book
      const booksWithUserInfo = books.map((book) => ({
        ...book,
        user,
      }));

      return {
        books: booksWithUserInfo,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        "Failed to find personalized books with user info",
        500,
      );
    }
  }

  static async findByIdWithUserInfo(bookId, userId) {
    try {
      // Get user information
      const user = await User.findById(userId)
        .select("name email") // Select only necessary user fields
        .lean();

      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      // Get book with chapters
      const book = await PersonalizedBookModel.findOne({
        _id: bookId,
        user_id: userId,
      }).exec();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      // Combine book and user information
      const bookWithUserInfo = {
        ...book.toObject(),
        user,
      };

      return bookWithUserInfo;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        "Failed to find personalized book with user info",
        500,
      );
    }
  }
  static async findByGenre(genre, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      // Query for books with the specified genre
      const books = await PersonalizedBookModel.find({
        "personalized_content.genre": genre,
      })
        .select("-personalized_content.chapters") // Exclude chapters
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments({
        "personalized_content.genre": genre,
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
      throw new ErrorHandler("Failed to find personalized books by genre", 500);
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

      // Build query with user_id and additional filters
      const query = { user_id: userId };

      // Add optional filters
      if (filters.is_paid !== undefined) query.is_paid = filters.is_paid;
      if (filters.min_price !== undefined)
        query.price = { $gte: parseFloat(filters.min_price) };
      if (filters.max_price !== undefined) {
        query.price = query.price || {};
        query.price.$lte = parseFloat(filters.max_price);
      }

      // Get user information
      const user = await User.findById(userId)
        .select("name email createdAt") // Select necessary user fields
        .lean();

      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      // Get books without chapters
      const books = await PersonalizedBookModel.find(query)
        .select("-personalized_content.chapters") // Exclude chapters
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments(query);

      // Add user information to each book
      const booksWithUserInfo = books.map((book) => ({
        ...book,
        user,
      }));

      return {
        books: booksWithUserInfo,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to find personalized books for user", 500);
    }
  }

  static async findOneForAdmin(bookId, options = {}) {
    try {
      const { includeChapters = true } = options;

      // Build projection
      const projection = includeChapters
        ? {}
        : { "-personalized_content.chapters": 1 };

      // Get the book
      const book = await PersonalizedBookModel.findById(bookId)
        .select(projection)
        .lean();

      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      // Get user information
      const user = await User.findById(book.user_id)
        .select("name email createdAt") // Select necessary user fields
        .lean();

      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      // Combine book and user information
      const bookWithUserInfo = {
        ...book,
        user,
      };

      return bookWithUserInfo;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find personalized book for admin", 500);
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

      // Build query based on filters
      const query = {};

      // Add filters
      if (filters.is_paid !== undefined) query.is_paid = filters.is_paid;
      if (filters.user_id) query.user_id = filters.user_id;
      if (filters.min_price !== undefined)
        query.price = { $gte: parseFloat(filters.min_price) };
      if (filters.max_price !== undefined) {
        query.price = query.price || {};
        query.price.$lte = parseFloat(filters.max_price);
      }
      if (filters.start_date)
        query.createdAt = { $gte: new Date(filters.start_date) };
      if (filters.end_date) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = new Date(filters.end_date);
      }
      if (filters.genre) query["personalized_content.genre"] = filters.genre;

      // Get books without chapters
      const books = await PersonalizedBookModel.find(query)
        .select("-personalized_content.chapters") // Exclude chapters
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      // Get user information for all books
      const userIds = [...new Set(books.map((book) => book.user_id))];
      const users = await User.find({ _id: { $in: userIds } })
        .select("name email createdAt") // Select necessary user fields
        .lean();

      // Create a user map for easy lookup
      const userMap = {};
      users.forEach((user) => {
        userMap[user._id] = user;
      });

      // Add user information to each book
      const booksWithUserInfo = books.map((book) => ({
        ...book,
        user: userMap[book.user_id] || null,
      }));

      const total = await PersonalizedBookModel.countDocuments(query);

      return {
        books: booksWithUserInfo,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler(
        "Failed to find personalized books for admin",
        500,
      );
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
  static async getGenreStats() {
    try {
      const genreStats = await PersonalizedBookModel.aggregate([
        {
          $group: {
            _id: "$personalized_content.genre",
            count: { $sum: 1 },
            total_revenue: {
              $sum: { $cond: [{ $eq: ["$is_paid", true] }, "$price", 0] },
            },
          },
        },
        { $sort: { count: -1 } },
      ]);

      return genreStats;
    } catch (error) {
      throw new ErrorHandler("Failed to get genre statistics", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }

  static async initiatePayment(bookId, userData) {
    try {
      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (book.is_paid) {
        throw new ErrorHandler("This book has already been paid for", 400);
      }

      const session = await stripeService.createCheckoutSession(
        book.price,
        {
          personalized_book_id: bookId.toString(),
          user_id: book.user_id.toString(),
          book_title:
            book.personalized_content?.book_title || "Personalized Book",
          child_name: book.child_name,
        },
        userData,
        `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        `${process.env.CLIENT_URL}/payment/cancel`,
      );

      logger.info("Checkout session created for personalized book", {
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

  static async confirmPayment(bookId, paymentIntentId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const paymentResult = await stripeService.confirmPayment(paymentIntentId);

      if (paymentResult.status !== "succeeded") {
        throw new ErrorHandler(
          `Payment not completed: ${paymentResult.status}`,
          400,
        );
      }

      // Get complete payment details
      const paymentDetails =
        await stripeService.getPaymentIntent(paymentIntentId);

      const book = await this.findById(bookId);
      stripeService.validatePaymentAmount(paymentDetails.amount, book.price);

      const updatedBook = await this.updatePaymentStatus(
        bookId,
        paymentIntentId,
        true,
      );

      const user = await User.findById(book.user_id);
      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      const receipt = await Receipt.createForSuccessfulPayment(
        {
          user_id: book.user_id,
          personalized_book_id: bookId,
          payment_intent_id: paymentIntentId,
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          customer_id: paymentDetails.customer,
          charge_id: paymentDetails.latest_charge,
          payment_method: paymentDetails.payment_method,
          status: paymentDetails.status,
        },
        {
          book_title: book.personalized_content?.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.personalized_content?.genre,
          author: book.personalized_content?.author,
          cover_image: book.personalized_content?.cover_image?.[0],
        },
        {
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
          username: user.username,
        },
      );

      await session.commitTransaction();
      session.endSession();

      logger.info("Payment completed and receipt created", {
        bookId,
        paymentIntentId,
        receiptId: receipt._id,
      });

      return {
        book: updatedBook,
        receipt: receipt,
        payment: paymentDetails,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      logger.error("Payment confirmation failed", {
        error: error.message,
        bookId,
        paymentIntentId,
      });

      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Payment confirmation failed: ${error.message}`,
        500,
      );
    }
  }

  static async confirmPaymentWithSession(sessionId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const checkoutSession = await stripeService.getCheckoutSession(sessionId);

      if (checkoutSession.payment_status !== "paid") {
        throw new ErrorHandler(
          `Payment not completed: ${checkoutSession.payment_status}`,
          400,
        );
      }

      const bookId = checkoutSession.metadata.personalized_book_id;
      const paymentIntentId = checkoutSession.payment_intent.id;

      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      stripeService.validatePaymentAmount(
        checkoutSession.amount_total,
        book.price,
      );
      const updatedBook = await this.updatePaymentStatus(
        bookId,
        paymentIntentId,
        true,
      );

      const user = await User.findById(book.user_id);
      if (!user) {
        throw new ErrorHandler("User not found", 404);
      }

      const receipt = await Receipt.createForSuccessfulPayment(
        {
          user_id: book.user_id,
          personalized_book_id: bookId,
          payment_intent_id: paymentIntentId,
          amount: checkoutSession.amount_total,
          currency: checkoutSession.currency,
          customer_id: checkoutSession.payment_intent.customer,
          charge_id: checkoutSession.payment_intent.latest_charge,
          payment_method: checkoutSession.payment_intent.payment_method,
          status: checkoutSession.payment_intent.status,
        },
        {
          book_title: book.personalized_content?.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.personalized_content?.genre,
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
        user.email,
        user.username,
        (checkoutSession.amount_total / 100).toFixed(2),
        new Date(checkoutSession.created * 1000).toLocaleDateString(),
        bookId,
        book.personalized_content?.book_title || "Personalized Story Book",
        book.child_name,
        (checkoutSession.amount_subtotal / 100).toFixed(2),
        "0.00",
        (
          (checkoutSession.amount_total - checkoutSession.amount_subtotal) /
          100
        ).toFixed(2),
        (checkoutSession.amount_total / 100).toFixed(2),
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
        session: checkoutSession,
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
          book_title: book.personalized_content?.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.personalized_content?.genre,
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

  static async handlePaymentSuccess(paymentIntent) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id: paymentIntentId, metadata, amount } = paymentIntent;
      const bookId = metadata.personalized_book_id;

      if (!bookId) {
        logger.warn(
          "No book ID in payment metadata, skipping receipt creation",
          {
            paymentIntentId,
            metadata,
          },
        );
        await session.commitTransaction();
        session.endSession();
        return;
      }

      // Check if receipt already exists (idempotency)
      const existingReceipt =
        await Receipt.findByPaymentIntentId(paymentIntentId);
      if (existingReceipt) {
        logger.info("Receipt already exists for this payment", {
          paymentIntentId,
        });
        await session.commitTransaction();
        session.endSession();
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
          amount: amount / 100,
          currency: paymentIntent.currency,
          customer_id: paymentIntent.customer,
          charge_id: paymentIntent.latest_charge,
          payment_method: paymentIntent.payment_method,
          status: paymentIntent.status,
        },
        {
          book_title: book.personalized_content?.book_title,
          child_name: book.child_name,
          child_age: book.child_age,
          genre: book.personalized_content?.genre,
          author: book.personalized_content?.author,
          cover_image: book.personalized_content?.cover_image?.[0],
        },
        {
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
          username: user.username,
        },
      );

      await session.commitTransaction();
      session.endSession();
      await emailService.logger.info(
        "Receipt created via webhook for successful payment",
        {
          bookId,
          paymentIntentId,
          amount: amount / 100,
        },
      );
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      logger.error("Failed to process payment success webhook", {
        error: error.message,
        paymentIntentId: paymentIntent.id,
      });
      // Don't throw error to prevent webhook retries for non-critical issues
    }
  }

  /**
   * Handle refund webhook
   */
  static async handleRefund(charge) {
    try {
      const { payment_intent: paymentIntentId, amount_refunded } = charge;

      // Find receipt by payment intent ID
      const receipt = await Receipt.findByPaymentIntentId(paymentIntentId);
      if (!receipt) {
        logger.warn("No receipt found for refund webhook", { paymentIntentId });
        return;
      }

      // Mark receipt as refunded
      await Receipt.markAsRefunded(
        receipt._id,
        amount_refunded / 100,
        "processed_via_webhook",
      );

      logger.info("Receipt updated for refund via webhook", {
        receiptId: receipt._id,
        refundAmount: amount_refunded / 100,
      });
    } catch (error) {
      logger.error("Failed to process refund webhook", {
        error: error.message,
        chargeId: charge.id,
      });
    }
  }

  /**
   * Get payment receipt for a book
   */
  static async getReceipt(bookId, userId) {
    try {
      const book = await this.findById(bookId);
      if (!book) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (book.user_id.toString() !== userId.toString()) {
        throw new ErrorHandler("Access denied", 403);
      }

      if (!book.is_paid) {
        throw new ErrorHandler("No payment found for this book", 404);
      }

      // Find receipt by payment ID
      const receipt = await Receipt.findByReferenceCode(
        book.payment_id,
        userId,
      );

      return receipt;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to retrieve receipt", 500);
    }
  }

  /**
   * Get payment history for a user's personalized books
   */
  static async getPaymentHistory(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      // Get user's paid books
      const paidBooks = await PersonalizedBookModel.find({
        user_id: userId,
        is_paid: true,
      })
        .select("child_name personalized_content price payment_id payment_date")
        .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await PersonalizedBookModel.countDocuments({
        user_id: userId,
        is_paid: true,
      });

      // Get receipt details for each paid book
      const paymentHistory = await Promise.all(
        paidBooks.map(async (book) => {
          try {
            const receipt = await Receipt.findByReferenceCode(
              book.payment_id,
              userId,
            );
            return {
              book: {
                child_name: book.child_name,
                book_title: book.personalized_content?.book_title,
                genre: book.personalized_content?.genre,
                price: book.price,
                payment_date: book.payment_date,
              },
              receipt: receipt,
            };
          } catch (error) {
            // If receipt not found, return basic book info
            return {
              book: {
                child_name: book.child_name,
                book_title: book.personalized_content?.book_title,
                genre: book.personalized_content?.genre,
                price: book.price,
                payment_date: book.payment_date,
              },
              receipt: null,
            };
          }
        }),
      );

      return {
        payments: paymentHistory,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to retrieve payment history", 500);
    }
  }
}

export default PersonalizedBook;

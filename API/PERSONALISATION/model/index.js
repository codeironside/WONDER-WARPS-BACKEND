import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import User from "../../USER/model/index.js";

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

      return book.toObject();
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

  // Get one personalized book for admin with chapters and user information
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

  // Get all personalized books for admin dashboard with advanced filtering
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

  // Get personalized books grouped by payment status for admin dashboard
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

  // Get personalized books grouped by genre for admin dashboard
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
}

export default PersonalizedBook;

import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";

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

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default PersonalizedBook;
